import { createWorkTracker } from '@ank-ingress/runtime';
import { releaseLeaseList } from "./publisher-io.js";
import { tick } from "./shard-loop.js";
export function createOutboxPublisher(options) {
    const maxShards = options.maxShards ?? 64;
    const leaseTtlMs = options.leaseTtlMs ?? 15_000;
    const batchSize = options.batchSize ?? 1_000;
    const pollIntervalMs = options.pollIntervalMs ?? 100;
    const maxBackoffMs = options.maxBackoffMs ?? 5_000;
    const deliveryTimeoutMs = options.deliveryTimeoutMs ?? 10_000;
    const maxAttempts = options.maxAttempts ?? 10;
    const state = {
        options,
        maxShards,
        leaseTtlMs,
        batchSize,
        pollIntervalMs,
        maxBackoffMs,
        deliveryTimeoutMs,
        maxAttempts,
        tracker: createWorkTracker(),
        stopping: false,
        timer: undefined,
        activeLeases: [],
        consecutiveFailures: 0,
    };
    return {
        async start() {
            state.stopping = false;
            state.consecutiveFailures = 0;
            void tick(state);
        },
        async stop() {
            state.stopping = true;
            if (state.timer !== undefined) {
                clearTimeout(state.timer);
                state.timer = undefined;
            }
        },
        async drain(signal) {
            await state.tracker.idle(signal);
        },
        async release() {
            if (state.activeLeases.length > 0) {
                const remaining = [...state.activeLeases];
                state.activeLeases = [];
                await releaseLeaseList(state, remaining);
            }
        },
    };
}
