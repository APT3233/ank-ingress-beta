import type RdKafka from '@confluentinc/kafka-javascript';
export declare function toRdKafkaHeaders(headers?: Readonly<Record<string, string | Buffer | undefined>>): RdKafka.MessageHeader[] | undefined;
export declare function fromRdKafkaHeaders(raw?: RdKafka.MessageHeader[]): Readonly<Record<string, Buffer | string | undefined>>;
