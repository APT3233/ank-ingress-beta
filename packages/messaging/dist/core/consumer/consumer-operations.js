import { AppError, CompositionError } from '@ank-ingress/kernel';
import { parseTraceparent, runInScope } from '@ank-ingress/observability';
import { decodeMessage } from "../codec/decode.js";
import { assertWithinDedupeWindow } from "./dedupe-window.js";
const DEFAULT_DEDUPE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const DEFAULT_REPLAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export function createConsumerOperations(options) {
    const inboxRetentionMs = options.inboxRetentionMs ?? options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
    const replayWindowMs = options.replayWindowMs ?? Math.min(DEFAULT_REPLAY_WINDOW_MS, Math.floor(inboxRetentionMs / 2));
    const dedupeWindowMs = options.dedupeWindowMs ?? inboxRetentionMs;
    if (inboxRetentionMs <= replayWindowMs) {
        throw new CompositionError(`Consumer inbox retention (${inboxRetentionMs}ms) must be strictly greater than replay window (${replayWindowMs}ms)`);
    }
    return {
        async inspect(filter) {
            return options.receiptStore.inspect({
                consumerGroup: options.consumerGroup,
                ...filter,
            });
        },
        async retry(opts) {
            const receipt = await options.receiptStore.getReceiptById(opts.receiptId);
            if (!receipt) {
                throw new AppError('COMMON-404-NOT_FOUND', {
                    message: `Consumer receipt ${opts.receiptId} not found`,
                });
            }
            if (receipt.status !== 'BLOCKED' && receipt.status !== 'QUARANTINED') {
                throw new AppError('COMMON-409-CONFLICT', {
                    message: `Receipt ${opts.receiptId} cannot be retried from status ${receipt.status} (use resume for PARKED receipts)`,
                });
            }
            const decoded = decodeMessage({
                key: receipt.rawKey,
                value: receipt.rawValue,
                headers: receipt.rawHeaders,
            }, options.catalogs);
            assertWithinDedupeWindow(dedupeWindowMs, receipt, decoded.envelope.occurredAt, opts.allowExpiredDedupeWindow);
            const matching = options.handlers.filter((h) => h.topic === receipt.topic && h.eventType === decoded.envelope.type);
            const trace = parseTraceparent(decoded.traceparent ?? undefined);
            const updated = await runInScope({
                correlationId: decoded.envelope.correlationId,
                traceId: trace?.traceId,
                spanId: trace?.parentId,
                traceparent: decoded.traceparent ?? undefined,
                tenantId: decoded.envelope.tenantId,
            }, async () => options.openTx(async (tx) => {
                for (const handler of matching) {
                    const ac = new AbortController();
                    const fresh = await options.inbox.record(tx, handler.name, decoded.envelope.id);
                    if (fresh) {
                        await handler.handle(decoded.envelope, tx, ac.signal);
                    }
                }
                const retried = await options.receiptStore.markRetriedInTx(tx, receipt.receiptId, opts.actor, opts.reason);
                if (options.onAudit) {
                    await options.onAudit({
                        action: 'CONSUMER_RECEIPT_RETRIED',
                        objectId: receipt.receiptId,
                        actor: opts.actor,
                        tenantId: receipt.tenantId,
                        extra: {
                            eventId: decoded.envelope.id,
                            aggregateType: decoded.envelope.aggregateType,
                            aggregateId: decoded.envelope.aggregateId,
                            sequence: decoded.envelope.sequence ?? null,
                            reason: opts.reason ?? null,
                        },
                    }, tx);
                }
                return retried;
            }));
            if (receipt.aggregateType && receipt.aggregateId) {
                await options.receiptStore.clearAggregateBlockIfResolved({
                    consumerGroup: receipt.consumerGroup,
                    tenantId: receipt.tenantId,
                    aggregateType: receipt.aggregateType,
                    aggregateId: receipt.aggregateId,
                });
            }
            return { status: updated.status, receipt: updated };
        },
        async skipWithReason(opts) {
            const trimmedReason = typeof opts.reason === 'string' ? opts.reason.trim() : '';
            if (trimmedReason.length === 0) {
                throw new AppError('COMMON-422-VALIDATION', {
                    message: 'skipWithReason requires a non-empty reason',
                });
            }
            const receipt = await options.receiptStore.getReceiptById(opts.receiptId);
            if (!receipt) {
                throw new AppError('COMMON-404-NOT_FOUND', {
                    message: `Consumer receipt ${opts.receiptId} not found`,
                });
            }
            const updated = await options.openTx(async (tx) => {
                const skipped = await options.receiptStore.markSkippedInTx(tx, receipt.receiptId, opts.actor, trimmedReason);
                await options.onAudit?.({
                    action: 'CONSUMER_RECEIPT_SKIPPED',
                    objectId: receipt.receiptId,
                    actor: opts.actor,
                    tenantId: receipt.tenantId,
                    extra: {
                        eventId: receipt.eventId, aggregateType: receipt.aggregateType,
                        aggregateId: receipt.aggregateId, sequence: receipt.sequence, reason: trimmedReason,
                    },
                }, tx);
                return skipped;
            });
            return { status: updated.status, receipt: updated };
        },
        async resume(opts) {
            const blockedCheck = await options.receiptStore.inspect({
                consumerGroup: options.consumerGroup,
                tenantId: opts.tenantId,
                aggregateType: opts.aggregateType,
                aggregateId: opts.aggregateId,
                status: 'BLOCKED',
            });
            if (blockedCheck.receipts.length > 0) {
                throw new AppError('COMMON-409-CONFLICT', {
                    message: `Aggregate ${opts.aggregateType}:${opts.aggregateId} still has BLOCKED receipt(s); retry or skip them before resuming`,
                });
            }
            const parkedList = await options.receiptStore.listParkedForAggregate({
                consumerGroup: options.consumerGroup,
                tenantId: opts.tenantId,
                aggregateType: opts.aggregateType,
                aggregateId: opts.aggregateId,
            });
            let replayedCount = 0;
            for (const parked of parkedList) {
                const decoded = decodeMessage({
                    key: parked.rawKey,
                    value: parked.rawValue,
                    headers: parked.rawHeaders,
                }, options.catalogs);
                assertWithinDedupeWindow(dedupeWindowMs, parked, decoded.envelope.occurredAt, opts.allowExpiredDedupeWindow);
                const matching = options.handlers.filter((h) => h.topic === parked.topic && h.eventType === decoded.envelope.type);
                const trace = parseTraceparent(decoded.traceparent ?? undefined);
                await runInScope({
                    correlationId: decoded.envelope.correlationId,
                    traceId: trace?.traceId,
                    spanId: trace?.parentId,
                    traceparent: decoded.traceparent ?? undefined,
                    tenantId: decoded.envelope.tenantId,
                }, async () => options.openTx(async (tx) => {
                    for (const handler of matching) {
                        const ac = new AbortController();
                        const fresh = await options.inbox.record(tx, handler.name, decoded.envelope.id);
                        if (fresh) {
                            await handler.handle(decoded.envelope, tx, ac.signal);
                        }
                    }
                    await options.receiptStore.markRetriedInTx(tx, parked.receiptId, opts.actor, opts.reason ?? 'Aggregate resumed');
                }));
                replayedCount++;
            }
            const unblocked = await options.receiptStore.clearAggregateBlockIfResolved({
                consumerGroup: options.consumerGroup,
                tenantId: opts.tenantId,
                aggregateType: opts.aggregateType,
                aggregateId: opts.aggregateId,
            });
            if (options.onAudit) {
                await options.onAudit({
                    action: 'CONSUMER_AGGREGATE_RESUMED',
                    objectId: `${opts.aggregateType}:${opts.aggregateId}`,
                    actor: opts.actor,
                    tenantId: opts.tenantId,
                    extra: {
                        aggregateType: opts.aggregateType,
                        aggregateId: opts.aggregateId,
                        replayedCount,
                        unblocked,
                        reason: opts.reason ?? null,
                    },
                });
            }
            return { replayedCount, unblocked };
        },
    };
}
