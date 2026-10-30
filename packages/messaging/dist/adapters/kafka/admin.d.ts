import type { KafkaAdmin } from '../../types/kafka.types.js';
import type { KafkaClientState } from './kafka-client-state.js';
/** Builds the framework admin over an AdminClient sharing the native producer handle (once per client). */
export declare function createAdmin(state: KafkaClientState): KafkaAdmin;
