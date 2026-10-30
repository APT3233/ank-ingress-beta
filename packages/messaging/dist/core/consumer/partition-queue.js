export async function waitWhileOverloaded(runner, topic, partition) {
    const { options, overloadPauseMs } = runner;
    if (!options.isOverloaded || !options.isOverloaded()) {
        return;
    }
    options.consumer.pause([{ topic, partitions: [partition] }]);
    try {
        while (!runner.stopping && options.isOverloaded()) {
            await new Promise((res) => setTimeout(res, overloadPauseMs));
        }
    }
    finally {
        if (!runner.stopping) {
            options.consumer.resume([{ topic, partitions: [partition] }]);
        }
    }
}
export function maybeResumePausedPartitions(runner) {
    const { options, maxQueueRecords, maxQueueBytes } = runner;
    if (runner.stopping)
        return;
    if (runner.totalQueuedRecords < maxQueueRecords && runner.totalQueuedBytes < maxQueueBytes) {
        for (const st of runner.partitionStates.values()) {
            if (st.pausedByQueue && !st.revoked && st.queue.length < maxQueueRecords) {
                st.pausedByQueue = false;
                options.consumer.resume([{ topic: st.topic, partitions: [st.partition] }]);
            }
        }
    }
}
export async function handlePartitionsRevoked(runner, partitions) {
    const inFlightWaiters = [];
    for (const tp of partitions) {
        const key = `${tp.topic}:${tp.partition}`;
        const state = runner.partitionStates.get(key);
        if (!state)
            continue;
        state.revoked = true;
        while (state.queue.length > 0) {
            const dropped = state.queue.shift();
            runner.totalQueuedRecords = Math.max(0, runner.totalQueuedRecords - 1);
            runner.totalQueuedBytes = Math.max(0, runner.totalQueuedBytes - dropped.byteSize);
            dropped.resolveDone();
        }
        if (state.inFlightPromise) {
            inFlightWaiters.push(state.inFlightPromise.catch(() => { }));
        }
        runner.partitionStates.delete(key);
    }
    if (inFlightWaiters.length > 0) {
        await Promise.all(inFlightWaiters);
    }
}
