import type { Catalogs, ConsumerInspectFilter, ConsumerInspectResult, ConsumerReceiptRecord, ConsumerReceiptStatus, ConsumerReceiptStore, ConsumerSpec, InboxStore } from '@ank-ingress/contracts';
import type { Logger, MetricsRegistry } from '@ank-ingress/observability';
import type { KafkaConsumer as Consumer, KafkaProducer as Producer } from './kafka.types.js';
export interface ConsumerRunnerOptions<Tx = unknown> {
    readonly consumer: Consumer;
    readonly consumerGroup?: string;
    readonly topics: readonly string[];
    readonly catalogs: Catalogs;
    readonly handlers: readonly ConsumerSpec<Tx>[];
    readonly openTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
    readonly inbox: InboxStore<Tx>;
    readonly receiptStore?: ConsumerReceiptStore<Tx>;
    readonly dlqTopic?: string;
    readonly producer?: Producer;
    readonly logger?: Logger;
    readonly metrics?: MetricsRegistry;
    readonly executionController?: AbortController;
    /** Decides whether a driver error code is transient; defaults to the PostgreSQL SQLSTATE list. */
    readonly isTransientErrorCode?: (code: string) => boolean;
    readonly maxAttempts?: number;
    readonly retryBaseMs?: number;
    readonly maxRetryBackoffMs?: number;
    readonly overloadPauseMs?: number;
    readonly isOverloaded?: () => boolean;
    readonly partitionConcurrency?: number;
    readonly maxQueueRecords?: number;
    readonly maxQueueBytes?: number;
    /** Optional test/diagnostic hooks */
    readonly beforeDbCommit?: (info: {
        topic: string;
        partition: number;
        offset: string;
        eventId: string;
    }) => Promise<void> | void;
    readonly afterDbCommit?: (info: {
        topic: string;
        partition: number;
        offset: string;
        eventId: string;
    }) => Promise<void> | void;
    readonly beforeParkingCommit?: (info: {
        topic: string;
        partition: number;
        offset: string;
        eventId: string | null;
    }) => Promise<void> | void;
    readonly beforeOffsetCommit?: (info: {
        topic: string;
        partition: number;
        offset: string;
    }) => Promise<void> | void;
    readonly afterMessageProcessed?: (info: {
        topic: string;
        partition: number;
        offset: string;
    }) => void;
}
export interface ConsumerAuditEntry {
    readonly action: 'CONSUMER_RECEIPT_RETRIED' | 'CONSUMER_RECEIPT_SKIPPED' | 'CONSUMER_AGGREGATE_RESUMED';
    readonly objectId: string;
    readonly actor: string;
    readonly tenantId: number | null;
    readonly extra?: Readonly<Record<string, unknown>>;
}
export interface ConsumerOperationsOptions<Tx = unknown> {
    readonly consumerGroup: string;
    readonly receiptStore: ConsumerReceiptStore<Tx>;
    readonly catalogs: Catalogs;
    readonly handlers: readonly ConsumerSpec<Tx>[];
    readonly inbox: InboxStore<Tx>;
    readonly openTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
    readonly onAudit?: (entry: ConsumerAuditEntry, tx?: Tx) => Promise<void> | void;
    readonly dedupeWindowMs?: number;
    readonly inboxRetentionMs?: number;
    readonly replayWindowMs?: number;
}
export interface ConsumerOperations {
    inspect(filter?: ConsumerInspectFilter): Promise<ConsumerInspectResult>;
    retry(opts: {
        readonly receiptId: string;
        readonly actor: string;
        readonly reason?: string;
        readonly allowExpiredDedupeWindow?: boolean;
    }): Promise<{
        readonly status: ConsumerReceiptStatus;
        readonly receipt: ConsumerReceiptRecord;
    }>;
    skipWithReason(opts: {
        readonly receiptId: string;
        readonly actor: string;
        readonly reason: string;
    }): Promise<{
        readonly status: ConsumerReceiptStatus;
        readonly receipt: ConsumerReceiptRecord;
    }>;
    resume(opts: {
        readonly tenantId: number | null;
        readonly aggregateType: string;
        readonly aggregateId: string;
        readonly actor: string;
        readonly reason?: string;
        readonly allowExpiredDedupeWindow?: boolean;
    }): Promise<{
        readonly replayedCount: number;
        readonly unblocked: boolean;
    }>;
}
