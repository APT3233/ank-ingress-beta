import type { KafkaProducer } from '../../types/kafka.types.js';
import type { KafkaClientState } from './kafka-client-state.js';
/** Builds the framework producer over the shared native producer (once per client). */
export declare function createProducer(state: KafkaClientState): KafkaProducer;
