import type RdKafka from '@confluentinc/kafka-javascript';
import type { Logger } from '@ank-ingress/observability';
/** Registers the consumer error/log listeners, connects, and applies the default consume timeouts. */
export declare function connectNativeConsumer(nativeConsumer: RdKafka.KafkaConsumer, logger: Logger | undefined, groupId: string, connectTimeoutMs: number, consumeTimeoutMs: number): Promise<void>;
