import type { KafkaAdmin, KafkaBundle, KafkaConfig, KafkaConsumer, KafkaProducer } from '../../types/kafka.types.js';
/** Framework-owned aliases (never re-exporting vendor classes). */
export type Producer = KafkaProducer;
export type Consumer = KafkaConsumer;
export type Admin = KafkaAdmin;
export declare function createKafka(config: KafkaConfig): Promise<KafkaBundle>;
