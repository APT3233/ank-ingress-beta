import type { ConsumerRunnerState, PartitionQueueState } from './partition-queue.js';
export declare function commitOffsetSafely<Tx>(runner: ConsumerRunnerState<Tx>, state: PartitionQueueState, offset: string, heartbeat: () => Promise<void>, processedOffsets?: readonly string[]): Promise<void>;
