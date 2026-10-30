import { parseTraceparent, runInScope } from '@ank-ingress/observability';
import { classifyAndDecodeMessage } from "../codec/decode.js";
import { classifyExecutionError, isPostgresTransientSqlState } from "./execution-errors.js";
import { commitOffsetSafely } from "./offset-commit.js";
import { waitWhileOverloaded } from "./partition-queue.js";
import { executeWithTransientRetry, sendToDlq } from "./retry-and-dlq.js";
export async function processSingleMessage(runner, state, message, heartbeat) {
    const { options, consumerGroup, maxAttempts, retryBaseMs, maxRetryBackoffMs, executionController, quarantinedCounter, ignoredCounter, processedCounter, parkedCounter, blockedCounter, transientRetryCounter } = runner;
    const { topic, partition } = state;
    if (runner.stopping || state.revoked)
        return;
    await waitWhileOverloaded(runner, topic, partition);
    if (runner.stopping || state.revoked)
        return;
    const classified = classifyAndDecodeMessage({
        key: message.key,
        value: message.value,
        headers: message.headers,
    }, options.catalogs);
    const receiptInput = {
        consumerGroup,
        topic,
        partition,
        offset: message.offset,
        rawKey: classified.rawKey,
        rawValue: classified.rawValue,
        rawHeaders: classified.headers,
        eventId: classified.meta.eventId,
        eventType: classified.meta.eventType,
        eventVersion: classified.meta.eventVersion,
        tenantId: classified.meta.tenantId,
        aggregateType: classified.meta.aggregateType,
        aggregateId: classified.meta.aggregateId,
        sequence: classified.meta.sequence,
        correlationId: classified.meta.correlationId,
        traceparent: classified.meta.traceparent,
    };
    // 1. Quarantine undecodable / unknown event type / unsupported version
    if (classified.kind === 'quarantine') {
        options.logger?.warn('consumer.message_quarantined', {
            consumerGroup,
            topic,
            partition,
            offset: message.offset,
            errorCode: classified.errorCode,
            error: classified.errorMessage,
        });
        quarantinedCounter?.inc({
            consumer_group: consumerGroup,
            topic,
            reason: classified.errorCode,
        });
        if (options.receiptStore) {
            await executeWithTransientRetry(runner, async () => {
                await options.receiptStore.recordQuarantined(receiptInput, {
                    errorCode: classified.errorCode,
                    errorMessage: classified.errorMessage,
                });
            }, heartbeat, topic);
        }
        else {
            await sendToDlq(runner, topic, message, classified.headers, classified.errorMessage, 1);
        }
        await commitOffsetSafely(runner, state, message.offset, heartbeat);
        return;
    }
    // 2. Permanent payload schema error -> block aggregate
    if (classified.kind === 'permanent_error') {
        options.logger?.error('consumer.message_invalid_payload_blocked', {
            consumerGroup,
            topic,
            partition,
            offset: message.offset,
            errorCode: classified.errorCode,
            error: classified.errorMessage,
        });
        blockedCounter?.inc({
            consumer_group: consumerGroup,
            topic,
            error_code: classified.errorCode,
        });
        if (options.receiptStore) {
            await executeWithTransientRetry(runner, async () => {
                await options.receiptStore.recordPermanentFailure(receiptInput, {
                    attempts: 1,
                    errorCode: classified.errorCode,
                    errorMessage: classified.errorMessage,
                });
            }, heartbeat, topic);
        }
        else {
            await sendToDlq(runner, topic, message, classified.headers, classified.errorMessage, 1);
        }
        await commitOffsetSafely(runner, state, message.offset, heartbeat);
        return;
    }
    // 3. Decoded valid event
    const { decoded } = classified;
    const matching = options.handlers.filter((h) => h.topic === topic && h.eventType === decoded.envelope.type);
    if (matching.length === 0) {
        ignoredCounter?.inc({
            consumer_group: consumerGroup,
            topic,
            event_type: decoded.envelope.type,
        });
        options.logger?.info('consumer.message_ignored', {
            consumerGroup,
            topic,
            partition,
            offset: message.offset,
            eventId: decoded.envelope.id,
            eventType: decoded.envelope.type,
        });
        if (options.receiptStore) {
            await executeWithTransientRetry(runner, async () => {
                await options.receiptStore.recordIgnored(receiptInput);
            }, heartbeat, topic);
        }
        await commitOffsetSafely(runner, state, message.offset, heartbeat);
        return;
    }
    const trace = parseTraceparent(decoded.traceparent ?? undefined);
    let attempt = 0;
    let succeeded = false;
    while (!runner.stopping && !state.revoked && !succeeded) {
        attempt++;
        try {
            const txResult = await runInScope({
                correlationId: decoded.envelope.correlationId,
                traceId: trace?.traceId,
                spanId: trace?.parentId,
                traceparent: decoded.traceparent ?? undefined,
                tenantId: decoded.envelope.tenantId,
            }, async () => options.openTx(async (tx) => {
                if (options.receiptStore) {
                    const prep = await options.receiptStore.prepareInTx(tx, receiptInput);
                    if (prep.action === 'already_resolved') {
                        return { outcome: 'already_resolved' };
                    }
                    if (prep.action === 'parked') {
                        if (options.beforeParkingCommit) {
                            await options.beforeParkingCommit({
                                topic,
                                partition,
                                offset: message.offset,
                                eventId: decoded.envelope.id,
                            });
                        }
                        return { outcome: 'parked' };
                    }
                    for (const handler of matching) {
                        const ac = executionController;
                        const fresh = await options.inbox.record(tx, handler.name, decoded.envelope.id);
                        if (fresh) {
                            await handler.handle(decoded.envelope, tx, ac.signal);
                        }
                    }
                    await options.receiptStore.markProcessedInTx(tx, prep.receiptId);
                    if (options.beforeDbCommit) {
                        await options.beforeDbCommit({
                            topic,
                            partition,
                            offset: message.offset,
                            eventId: decoded.envelope.id,
                        });
                    }
                    return { outcome: 'processed' };
                }
                for (const handler of matching) {
                    const ac = executionController;
                    const fresh = await options.inbox.record(tx, handler.name, decoded.envelope.id);
                    if (fresh) {
                        await handler.handle(decoded.envelope, tx, ac.signal);
                    }
                }
                if (options.beforeDbCommit) {
                    await options.beforeDbCommit({
                        topic,
                        partition,
                        offset: message.offset,
                        eventId: decoded.envelope.id,
                    });
                }
                return { outcome: 'processed' };
            }));
            if (txResult.outcome === 'parked') {
                parkedCounter?.inc({
                    consumer_group: consumerGroup,
                    topic,
                    event_type: decoded.envelope.type,
                });
                options.logger?.warn('consumer.message_parked', {
                    consumerGroup,
                    topic,
                    partition,
                    offset: message.offset,
                    eventId: decoded.envelope.id,
                    aggregateType: decoded.envelope.aggregateType,
                    aggregateId: decoded.envelope.aggregateId,
                    sequence: decoded.envelope.sequence,
                });
            }
            else if (txResult.outcome === 'processed') {
                processedCounter?.inc({
                    consumer_group: consumerGroup,
                    topic,
                    event_type: decoded.envelope.type,
                });
            }
            if (options.afterDbCommit) {
                await options.afterDbCommit({
                    topic,
                    partition,
                    offset: message.offset,
                    eventId: decoded.envelope.id,
                });
            }
            succeeded = true;
        }
        catch (err) {
            if (err?.simulatedCrash === true) {
                throw err;
            }
            const errClass = classifyExecutionError(err, options.catalogs, options.isTransientErrorCode ?? isPostgresTransientSqlState);
            if (errClass.category === 'TRANSIENT') {
                transientRetryCounter?.inc({
                    consumer_group: consumerGroup,
                    topic,
                    error_code: errClass.errorCode,
                });
                options.logger?.warn('consumer.transient_error_retry', {
                    consumerGroup,
                    topic,
                    partition,
                    offset: message.offset,
                    attempt,
                    errorCode: errClass.errorCode,
                    error: errClass.errorMessage,
                });
                if (options.receiptStore) {
                    await options.receiptStore
                        .recordTransientAttempt(receiptInput, {
                        attempts: attempt,
                        errorCode: errClass.errorCode,
                        errorMessage: errClass.errorMessage,
                    })
                        .catch(() => { });
                }
                const delay = Math.min(maxRetryBackoffMs, retryBaseMs * Math.pow(2, Math.min(attempt - 1, 8))) +
                    Math.floor(Math.random() * Math.max(1, retryBaseMs));
                await new Promise((res) => setTimeout(res, delay));
                await heartbeat().catch(() => { });
                continue;
            }
            // Non-transient error: if UNKNOWN category, retry up to maxAttempts; if explicit PERMANENT, fail immediately when receiptStore is used (or after maxAttempts)
            if (errClass.category === 'UNKNOWN' && attempt < maxAttempts) {
                const jitter = Math.floor(Math.random() * Math.max(1, retryBaseMs));
                await new Promise((res) => setTimeout(res, retryBaseMs * attempt + jitter));
                await heartbeat().catch(() => { });
                continue;
            }
            // Permanent failure -> block aggregate in receiptStore (and/or send to DLQ)
            blockedCounter?.inc({
                consumer_group: consumerGroup,
                topic,
                error_code: errClass.errorCode,
            });
            options.logger?.error('consumer.permanent_failure_blocked', {
                consumerGroup,
                topic,
                partition,
                offset: message.offset,
                eventId: decoded.envelope.id,
                aggregateType: decoded.envelope.aggregateType,
                aggregateId: decoded.envelope.aggregateId,
                attempts: attempt,
                errorCode: errClass.errorCode,
                error: errClass.errorMessage,
            });
            if (options.receiptStore) {
                await executeWithTransientRetry(runner, async () => {
                    await options.receiptStore.recordPermanentFailure(receiptInput, {
                        attempts: attempt,
                        errorCode: errClass.errorCode,
                        errorMessage: errClass.errorMessage,
                    });
                }, heartbeat, topic);
            }
            else {
                await sendToDlq(runner, topic, message, decoded.headers, errClass.errorMessage, attempt);
            }
            break;
        }
    }
    if (!runner.stopping && !state.revoked) {
        await commitOffsetSafely(runner, state, message.offset, heartbeat);
    }
}
