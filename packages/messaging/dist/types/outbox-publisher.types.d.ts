import type { OutboxRecord, OutboxStore } from '@ank-ingress/contracts';
import type { Logger } from '@ank-ingress/observability';
import type { KafkaProducer } from './kafka.types.js';
export interface OutboxPublisherOptions {
    readonly store: OutboxStore;
    readonly producer: KafkaProducer;
    readonly owner: string;
    readonly maxShards?: number;
    readonly leaseTtlMs?: number;
    readonly batchSize?: number;
    readonly pollIntervalMs?: number;
    readonly maxBackoffMs?: number;
    readonly deliveryTimeoutMs?: number;
    readonly maxAttempts?: number;
    readonly logger?: Logger;
    /** Optional diagnostic/test hook called after broker delivery acknowledgement and before store.markPublished */
    readonly beforeMarkPublished?: (records: readonly OutboxRecord[]) => Promise<void> | void;
}
