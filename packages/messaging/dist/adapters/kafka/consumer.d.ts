import type { KafkaConsumer, KafkaConsumerOptions } from '../../types/kafka.types.js';
import type { KafkaClientState } from './kafka-client-state.js';
/** Creates one framework consumer for a group; its rebalance, run loop and pause/resume share per-consumer state. */
export declare function createKafkaConsumer(state: KafkaClientState, groupId: string, options?: KafkaConsumerOptions): Promise<KafkaConsumer>;
