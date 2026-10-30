import { parseTraceparent, runInScope } from '@ank-ingress/observability';
import { classifyAndDecodeMessage } from "../codec/decode.js";
import { commitOffsetSafely } from "./offset-commit.js";
import { maybeResumePausedPartitions } from "./partition-queue.js";
const FALLBACK_TO_SINGLE = Symbol('FALLBACK_TO_SINGLE');
export async function tryProcessPartitionBatch(runner, state) {
    const { options, consumerGroup, executionController, processedCounter } = runner;
    if (runner.stopping ||
        state.revoked ||
        state.batchDisabled ||
        state.queue.length < 8 ||
        !options.receiptStore?.prepareBatchInTx ||
        !options.receiptStore?.markProcessedBatchInTx ||
        !options.inbox.recordBatch ||
        Boolean(options.beforeDbCommit) ||
        Boolean(options.afterDbCommit) ||
        Boolean(options.beforeParkingCommit) ||
        Boolean(options.beforeOffsetCommit) ||
        Boolean(options.isOverloaded?.())) {
        return false;
    }
    const { topic, partition } = state;
    const maxSlice = Math.min(128, state.queue.length);
    const seenEventIds = new Set();
    const slice = [];
    for (let i = 0; i < maxSlice; i++) {
        const item = state.queue[i];
        const classified = classifyAndDecodeMessage({
            key: item.message.key,
            value: item.message.value,
            headers: item.message.headers,
        }, options.catalogs);
        if (classified.kind !== 'ok') {
            break;
        }
        const { decoded } = classified;
        const matching = options.handlers.filter((h) => h.topic === topic && h.eventType === decoded.envelope.type);
        if (matching.length === 0) {
            break;
        }
        const eventId = decoded.envelope.id;
        if (!eventId || seenEventIds.has(eventId)) {
            break;
        }
        seenEventIds.add(eventId);
        slice.push({
            item,
            decoded,
            matching,
            receiptInput: {
                consumerGroup,
                topic,
                partition,
                offset: item.message.offset,
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
            },
        });
    }
    if (slice.length < 2) {
        return false;
    }
    // Pop the slice from state.queue
    state.queue.splice(0, slice.length);
    let sliceBytes = 0;
    for (const s of slice) {
        sliceBytes += s.item.byteSize;
    }
    runner.totalQueuedRecords = Math.max(0, runner.totalQueuedRecords - slice.length);
    runner.totalQueuedBytes = Math.max(0, runner.totalQueuedBytes - sliceBytes);
    maybeResumePausedPartitions(runner);
    try {
        await options.openTx(async (tx) => {
            const decisions = await options.receiptStore.prepareBatchInTx(tx, slice.map((s) => s.receiptInput));
            if (!decisions || decisions.length !== slice.length) {
                throw FALLBACK_TO_SINGLE;
            }
            const inboxEntries = [];
            for (let i = 0; i < slice.length; i++) {
                const s = slice[i];
                for (const handler of s.matching) {
                    inboxEntries.push({
                        consumer: handler.name,
                        eventId: s.decoded.envelope.id,
                        msgIdx: i,
                        handler,
                    });
                }
            }
            const freshFlags = await options.inbox.recordBatch(tx, inboxEntries.map((e) => ({ consumer: e.consumer, eventId: e.eventId })));
            for (let j = 0; j < inboxEntries.length; j++) {
                if (!freshFlags[j])
                    continue;
                const entry = inboxEntries[j];
                const s = slice[entry.msgIdx];
                const trace = parseTraceparent(s.decoded.traceparent ?? undefined);
                await runInScope({
                    correlationId: s.decoded.envelope.correlationId,
                    traceId: trace?.traceId,
                    spanId: trace?.parentId,
                    traceparent: s.decoded.traceparent ?? undefined,
                    tenantId: s.decoded.envelope.tenantId,
                }, async () => {
                    const ac = executionController;
                    await entry.handler.handle(s.decoded.envelope, tx, ac.signal);
                });
            }
            await options.receiptStore.markProcessedBatchInTx(tx, decisions.map((d) => d.receiptId));
        });
        for (const s of slice) {
            processedCounter?.inc({
                consumer_group: consumerGroup,
                topic,
                event_type: s.decoded.envelope.type,
            });
        }
        if (!runner.stopping && !state.revoked) {
            const last = slice.at(-1);
            await commitOffsetSafely(runner, state, last.item.message.offset, last.item.heartbeat, slice.map((s) => s.item.message.offset));
        }
        for (const s of slice) {
            s.item.resolveDone();
        }
        return true;
    }
    catch {
        // Transaction rolled back cleanly; push slice back and fall back to single-message execution
        state.batchDisabled = true;
        state.queue.unshift(...slice.map((s) => s.item));
        runner.totalQueuedRecords += slice.length;
        runner.totalQueuedBytes += sliceBytes;
        return false;
    }
}
