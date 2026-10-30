export async function releaseLeaseList(state, leases) {
    const { options } = state;
    if (leases.length === 0)
        return;
    if (options.store.releaseBatch) {
        await options.store.releaseBatch(leases).catch(() => { });
        return;
    }
    if (!options.store.release)
        return;
    await Promise.allSettled(leases.map((l) => options.store.release(l)));
}
export async function fetchAcrossLeases(state, leases) {
    const { options, batchSize } = state;
    if (leases.length === 0)
        return [];
    if (options.store.fetchBatch) {
        return options.store.fetchBatch(leases, batchSize);
    }
    const collected = [];
    for (const lease of leases) {
        if (state.stopping || collected.length >= batchSize)
            break;
        const remaining = batchSize - collected.length;
        const batch = await options.store.fetch(lease, remaining);
        for (const rec of batch) {
            collected.push(rec);
        }
    }
    return collected;
}
export async function deliverBatch(state, messages) {
    const { options, deliveryTimeoutMs } = state;
    if (typeof options.producer.publishBatch === 'function') {
        return options.producer.publishBatch(messages, { timeoutMs: deliveryTimeoutMs });
    }
    // Fallback for test doubles that only implement send()
    const results = [];
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        try {
            await options.producer.send({
                topic: m.topic,
                acks: -1,
                messages: [{ key: m.key, value: m.value, headers: m.headers }],
            });
            results.push({ index: i, topic: m.topic, partition: 0, offset: i, error: null });
        }
        catch (err) {
            results.push({
                index: i,
                topic: m.topic,
                partition: -1,
                offset: null,
                error: err instanceof Error ? err : new Error(String(err)),
            });
        }
    }
    return results;
}
