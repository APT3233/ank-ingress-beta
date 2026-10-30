import type RdKafka from '@confluentinc/kafka-javascript';
import type { Logger } from '@ank-ingress/observability';
import type { KafkaConfig, KafkaConsumer, KafkaDeliveryResult } from '../../types/kafka.types.js';
/** Shared client state built once per `createKafka` call and passed to the producer/admin/consumer sub-factories. */
export interface KafkaClientState {
    readonly config: KafkaConfig;
    readonly logger: Logger | undefined;
    readonly connectTimeoutMs: number;
    readonly deliveryTimeoutMs: number;
    readonly nativeProducer: RdKafka.Producer;
    readonly consumers: Set<KafkaConsumer>;
    produceCalls: number;
    batchCount: number;
    txRequests: number;
    txMessages: number;
    producerDisconnected: boolean;
}
export interface DeliveryOpaque {
    readonly index: number;
    readonly topic: string;
    readonly userOpaque: unknown;
    settled: boolean;
    readonly resolve: (res: KafkaDeliveryResult) => void;
}
