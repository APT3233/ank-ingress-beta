import type RdKafka from '@confluentinc/kafka-javascript';
import type { KafkaConsumedMessage } from '../../types/kafka.types.js';
export declare const toConsumedMessage: (m: RdKafka.Message) => KafkaConsumedMessage;
