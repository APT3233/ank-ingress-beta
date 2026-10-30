import { tryProcessPartitionBatch } from "./partition-batch.js";
import { maybeResumePausedPartitions } from "./partition-queue.js";
import { processSingleMessage } from "./single-message.js";
export function scheduleNextPartitions(runner) {
    const { partitionConcurrency } = runner;
    while (runner.activePartitions < partitionConcurrency && runner.pendingPartitions.length > 0 && !runner.stopping) {
        const next = runner.pendingPartitions.shift();
        if (next.running || next.revoked || next.queue.length === 0) {
            continue;
        }
        next.running = true;
        runner.activePartitions++;
        void drainPartition(runner, next);
    }
}
export async function drainPartition(runner, state) {
    const { options, retryBaseMs, tracker } = runner;
    const leave = tracker.enter();
    try {
        while (!runner.stopping && !state.revoked && state.queue.length > 0) {
            if (state.queue.length >= 8 && !state.batchDisabled) {
                const bp = tryProcessPartitionBatch(runner, state);
                state.inFlightPromise = bp.then(() => { });
                try {
                    const batched = await bp;
                    if (batched) {
                        continue;
                    }
                }
                finally {
                    state.inFlightPromise = null;
                }
            }
            const item = state.queue.shift();
            runner.totalQueuedRecords = Math.max(0, runner.totalQueuedRecords - 1);
            runner.totalQueuedBytes = Math.max(0, runner.totalQueuedBytes - item.byteSize);
            maybeResumePausedPartitions(runner);
            const p = processSingleMessage(runner, state, item.message, item.heartbeat);
            state.inFlightPromise = p;
            try {
                await p;
                item.resolveDone();
            }
            catch (err) {
                // Neither an infrastructure failure nor a failed offset commit transfers
                // ownership of fetched records. Retry the same head before later offsets.
                options.logger?.error('Consumer partition head failed; retaining fetched records', {
                    topic: state.topic, partition: state.partition, offset: item.message.offset,
                    error: err instanceof Error ? err.message : String(err),
                });
                if (runner.stopping || state.revoked) {
                    item.resolveDone();
                    break;
                }
                state.queue.unshift(item);
                runner.totalQueuedRecords++;
                runner.totalQueuedBytes += item.byteSize;
                await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryBaseMs)));
            }
            finally {
                state.inFlightPromise = null;
            }
        }
    }
    finally {
        state.batchDisabled = false;
        state.running = false;
        runner.activePartitions = Math.max(0, runner.activePartitions - 1);
        leave();
        if (runner.stopping || state.revoked) {
            while (state.queue.length > 0) {
                const item = state.queue.shift();
                runner.totalQueuedRecords = Math.max(0, runner.totalQueuedRecords - 1);
                runner.totalQueuedBytes = Math.max(0, runner.totalQueuedBytes - item.byteSize);
                item.resolveDone();
            }
        }
        if (!runner.stopping && !state.revoked && state.queue.length > 0) {
            if (!runner.pendingPartitions.includes(state)) {
                runner.pendingPartitions.push(state);
            }
        }
        scheduleNextPartitions(runner);
    }
}
export async function enqueuePartitionBatch(runner, topic, partition, messages, heartbeat) {
    const { options, maxQueueRecords, maxQueueBytes } = runner;
    if (runner.stopping || messages.length === 0)
        return;
    const key = `${topic}:${partition}`;
    let state = runner.partitionStates.get(key);
    if (!state || state.revoked) {
        state = {
            key,
            topic,
            partition,
            queue: [],
            running: false,
            revoked: false,
            pausedByQueue: false,
            batchDisabled: false,
            inFlightPromise: null,
        };
        runner.partitionStates.set(key, state);
    }
    const donePromises = [];
    for (const msg of messages) {
        const byteSize = (msg.size && msg.size > 0 ? msg.size : (msg.value?.byteLength ?? 0)) +
            (msg.key?.byteLength ?? 0);
        let resolveDone;
        const done = new Promise((res) => {
            resolveDone = res;
        });
        const item = {
            message: msg,
            byteSize,
            heartbeat,
            done,
            resolveDone,
        };
        state.queue.push(item);
        runner.totalQueuedRecords++;
        runner.totalQueuedBytes += byteSize;
        donePromises.push(done);
    }
    if (!state.running && !runner.pendingPartitions.includes(state)) {
        runner.pendingPartitions.push(state);
        scheduleNextPartitions(runner);
    }
    if (!state.pausedByQueue &&
        (state.queue.length >= maxQueueRecords ||
            runner.totalQueuedRecords >= maxQueueRecords ||
            runner.totalQueuedBytes >= maxQueueBytes)) {
        state.pausedByQueue = true;
        options.consumer.pause([{ topic, partitions: [partition] }]);
    }
    await Promise.all(donePromises);
}
