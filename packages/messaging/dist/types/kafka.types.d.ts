import type { Logger } from '@ank-ingress/observability';
import type { Resource } from '@ank-ingress/runtime';
export interface KafkaProducerMessage {
    readonly key?: string | Buffer | null;
    readonly value: Buffer | string | null;
    readonly partition?: number;
    readonly headers?: Readonly<Record<string, string | Buffer | undefined>>;
    readonly timestamp?: string | number;
    readonly opaque?: unknown;
}
export interface KafkaTopicMessages {
    readonly topic: string;
    readonly messages: readonly KafkaProducerMessage[];
    /** Accepted for call-site compatibility; producer always uses configured acks='all' (-1). */
    readonly acks?: number;
}
export interface KafkaDeliveryResult {
    readonly index: number;
    readonly topic: string;
    readonly partition: number;
    readonly offset: number | null;
    readonly opaque?: unknown;
    readonly error: Error | null;
}
export interface KafkaProducerStats {
    readonly produceCalls: number;
    readonly batchCount: number;
    readonly batchCalls: number;
    readonly batchMessagesSent: number;
    readonly txRequests: number;
    readonly txMessages: number;
    readonly tx: number;
    readonly txmsgs: number;
}
export interface KafkaProducer {
    send(record: KafkaTopicMessages): Promise<readonly KafkaDeliveryResult[]>;
    sendBatch(batch: {
        readonly topicMessages: readonly KafkaTopicMessages[];
        readonly acks?: number;
    }, options?: {
        readonly timeoutMs?: number;
    }): Promise<readonly KafkaDeliveryResult[]>;
    publishBatch(messages: readonly (KafkaProducerMessage & {
        readonly topic: string;
    })[], options?: {
        readonly timeoutMs?: number;
    }): Promise<readonly KafkaDeliveryResult[]>;
    flush(timeoutMs?: number): Promise<void>;
    getStats(): KafkaProducerStats;
    disconnect(): Promise<void>;
}
export interface KafkaConsumedMessage {
    readonly key: Buffer | null;
    readonly value: Buffer | null;
    readonly headers: Readonly<Record<string, Buffer | string | undefined>>;
    readonly offset: string;
    readonly timestamp: string;
    readonly size: number;
}
export interface KafkaEachMessagePayload {
    readonly topic: string;
    readonly partition: number;
    readonly message: KafkaConsumedMessage;
    readonly heartbeat: () => Promise<void>;
}
export interface KafkaEachBatchPayload {
    readonly topic: string;
    readonly partition: number;
    readonly messages: readonly KafkaConsumedMessage[];
    readonly heartbeat: () => Promise<void>;
}
export interface KafkaTopicPartition {
    readonly topic: string;
    readonly partition: number;
}
export interface KafkaTopicPartitionOffset extends KafkaTopicPartition {
    readonly offset: string;
}
export interface KafkaConsumerRunOptions {
    readonly autoCommit?: boolean;
    readonly maxBatchSize?: number;
    readonly partitionsConsumedConcurrently?: number;
    readonly onPartitionsAssigned?: (partitions: readonly KafkaTopicPartition[]) => void | Promise<void>;
    readonly onPartitionsRevoked?: (partitions: readonly KafkaTopicPartition[]) => void | Promise<void>;
    readonly eachMessage?: (payload: KafkaEachMessagePayload) => Promise<void>;
    readonly eachBatch?: (payload: KafkaEachBatchPayload) => Promise<void>;
}
export interface KafkaConsumerOptions {
    readonly fromBeginning?: boolean;
    readonly sessionTimeoutMs?: number;
    readonly heartbeatIntervalMs?: number;
    readonly maxPollIntervalMs?: number;
    readonly consumeTimeoutMs?: number;
    readonly onPartitionsAssigned?: (partitions: readonly KafkaTopicPartition[]) => void | Promise<void>;
    readonly onPartitionsRevoked?: (partitions: readonly KafkaTopicPartition[]) => void | Promise<void>;
}
export interface KafkaConsumer {
    subscribe(subscription: {
        readonly topic?: string;
        readonly topics?: readonly string[];
        readonly fromBeginning?: boolean;
    }): Promise<void>;
    run(options: KafkaConsumerRunOptions): Promise<void>;
    commitOffsets(offsets: readonly KafkaTopicPartitionOffset[]): Promise<void>;
    pause(topicPartitions: readonly {
        readonly topic: string;
        readonly partitions?: readonly number[];
    }[]): void;
    resume(topicPartitions: readonly {
        readonly topic: string;
        readonly partitions?: readonly number[];
    }[]): void;
    seek(topicPartition: KafkaTopicPartitionOffset): Promise<void>;
    assignment(): readonly KafkaTopicPartition[];
    stop(): Promise<void>;
    disconnect(): Promise<void>;
}
export interface KafkaAdmin {
    listTopics(timeoutMs?: number): Promise<string[]>;
    createTopics(options: {
        readonly waitForLeaders?: boolean;
        readonly topics: readonly {
            readonly topic: string;
            readonly numPartitions?: number;
            readonly replicationFactor?: number;
        }[];
    }): Promise<void>;
    disconnect(): Promise<void>;
}
export interface KafkaConfig {
    readonly clientId: string;
    readonly brokers: readonly string[];
    readonly name?: string;
    readonly required?: boolean;
    readonly logger?: Logger;
    readonly connectTimeoutMs?: number;
    readonly socketTimeoutMs?: number;
    readonly requestTimeoutMs?: number;
    readonly deliveryTimeoutMs?: number;
    readonly lingerMs?: number;
    readonly batchNumMessages?: number;
    readonly batchSizeBytes?: number;
    readonly compression?: 'none' | 'gzip' | 'snappy' | 'lz4' | 'zstd';
    readonly maxQueueMessages?: number;
    readonly maxQueueKbytes?: number;
    readonly maxInFlightRequests?: number;
    readonly retries?: number;
    readonly retryBackoffMs?: number;
    readonly retryBackoffMaxMs?: number;
    readonly statisticsIntervalMs?: number;
}
export interface KafkaBundle {
    readonly producer: KafkaProducer;
    readonly admin: KafkaAdmin;
    createConsumer(groupId: string, options?: KafkaConsumerOptions): Promise<KafkaConsumer>;
    ensureTopics(topics: readonly string[], numPartitions?: number): Promise<void>;
    readonly resource: Resource;
}
