import { type ConsumerRunnerState, type PartitionQueueState } from './partition-queue.js';
export declare function tryProcessPartitionBatch<Tx>(runner: ConsumerRunnerState<Tx>, state: PartitionQueueState): Promise<boolean>;
