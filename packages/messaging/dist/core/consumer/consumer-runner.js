import { createWorkTracker } from '@ank-ingress/runtime';
import { getConsumerMetrics } from "./consumer-metrics.js";
import { enqueuePartitionBatch } from "./partition-drain.js";
import { handlePartitionsRevoked } from "./partition-queue.js";
export function createConsumerRunner(options) {
    const consumerGroup = options.consumerGroup ?? 'default-consumer-group';
    const maxAttempts = options.maxAttempts ?? 3;
    const retryBaseMs = options.retryBaseMs ?? 50;
    const maxRetryBackoffMs = options.maxRetryBackoffMs ?? 5_000;
    const overloadPauseMs = options.overloadPauseMs ?? 200;
    const partitionConcurrency = Math.max(1, options.partitionConcurrency ?? 16);
    const maxQueueRecords = Math.max(1, options.maxQueueRecords ?? 512);
    const maxQueueBytes = Math.max(256, options.maxQueueBytes ?? 4 * 1024 * 1024);
    const executionController = options.executionController ?? new AbortController();
    const tracker = createWorkTracker();
    let consumerStopPromise;
    const metricHandles = getConsumerMetrics(options.metrics);
    const runner = {
        options,
        consumerGroup,
        maxAttempts,
        retryBaseMs,
        maxRetryBackoffMs,
        overloadPauseMs,
        partitionConcurrency,
        maxQueueRecords,
        maxQueueBytes,
        executionController,
        tracker,
        quarantinedCounter: metricHandles?.quarantinedCounter,
        ignoredCounter: metricHandles?.ignoredCounter,
        processedCounter: metricHandles?.processedCounter,
        parkedCounter: metricHandles?.parkedCounter,
        blockedCounter: metricHandles?.blockedCounter,
        transientRetryCounter: metricHandles?.transientRetryCounter,
        partitionStates: new Map(),
        pendingPartitions: [],
        stopping: false,
        activePartitions: 0,
        totalQueuedRecords: 0,
        totalQueuedBytes: 0,
    };
    return {
        async start() {
            runner.stopping = false;
            for (const topic of options.topics) {
                await options.consumer.subscribe({ topic, fromBeginning: true });
            }
            await options.consumer.run({
                autoCommit: false,
                maxBatchSize: 1024,
                partitionsConsumedConcurrently: partitionConcurrency,
                onPartitionsRevoked: (partitions) => handlePartitionsRevoked(runner, partitions),
                eachBatch: async ({ topic, partition, messages, heartbeat }) => {
                    await enqueuePartitionBatch(runner, topic, partition, messages, heartbeat);
                },
                eachMessage: async ({ topic, partition, message, heartbeat }) => {
                    await enqueuePartitionBatch(runner, topic, partition, [message], heartbeat);
                },
            });
        },
        async stop() {
            runner.stopping = true;
            for (const state of runner.partitionStates.values()) {
                while (state.queue.length > 0) {
                    const item = state.queue.shift();
                    runner.totalQueuedRecords = Math.max(0, runner.totalQueuedRecords - 1);
                    runner.totalQueuedBytes = Math.max(0, runner.totalQueuedBytes - item.byteSize);
                    item.resolveDone();
                }
            }
            consumerStopPromise = options.consumer.stop().catch(() => { });
        },
        async drain(signal) {
            const abortExecution = () => executionController.abort(signal.reason);
            signal.addEventListener('abort', abortExecution, { once: true });
            if (signal.aborted)
                abortExecution();
            try {
                await tracker.idle(signal);
                if (!signal.aborted)
                    await consumerStopPromise;
            }
            finally {
                signal.removeEventListener('abort', abortExecution);
            }
        },
        async release() {
            await options.consumer.disconnect().catch(() => { });
        },
    };
}
