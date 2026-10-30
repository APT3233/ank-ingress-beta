import type { KafkaClientState } from './kafka-client-state.js';
/** Registers the producer error/log/stats/delivery-report listeners (before connect). */
export declare function attachProducerEvents(state: KafkaClientState): void;
