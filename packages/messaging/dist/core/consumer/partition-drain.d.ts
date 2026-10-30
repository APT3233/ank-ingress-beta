import type { KafkaConsumedMessage } from '../../types/kafka.types.js';
import { type ConsumerRunnerState, type PartitionQueueState } from './partition-queue.js';
export declare function scheduleNextPartitions<Tx>(runner: ConsumerRunnerState<Tx>): void;
export declare function drainPartition<Tx>(runner: ConsumerRunnerState<Tx>, state: PartitionQueueState): Promise<void>;
export declare function enqueuePartitionBatch<Tx>(runner: ConsumerRunnerState<Tx>, topic: string, partition: number, messages: readonly KafkaConsumedMessage[], heartbeat: () => Promise<void>): Promise<void>;
