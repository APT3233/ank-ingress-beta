import type { KafkaConsumedMessage } from '../../types/kafka.types.js';
import { type ConsumerRunnerState, type PartitionQueueState } from './partition-queue.js';
export declare function processSingleMessage<Tx>(runner: ConsumerRunnerState<Tx>, state: PartitionQueueState, message: KafkaConsumedMessage, heartbeat: () => Promise<void>): Promise<void>;
