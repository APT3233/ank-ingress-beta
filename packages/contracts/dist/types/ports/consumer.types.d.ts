import type { EventEnvelope } from '../envelope.types.js';
export type ConsumerReceiptStatus = 'PENDING' | 'PROCESSED' | 'IGNORED' | 'PARKED' | 'BLOCKED' | 'QUARANTINED' | 'SKIPPED';
export type ConsumerErrorCategory = 'TRANSIENT' | 'PERMANENT' | 'QUARANTINE';
export interface ConsumerReceiptInput {
    readonly consumerGroup: string;
    readonly topic: string;
    readonly partition: number;
    readonly offset: string;
    readonly rawKey: string | null;
    readonly rawValue: string | null;
    readonly rawHeaders: Readonly<Record<string, string>>;
    readonly eventId: string | null;
    readonly eventType: string | null;
    readonly eventVersion: number | null;
    readonly tenantId: number | null;
    readonly aggregateType: string | null;
    readonly aggregateId: string | null;
    readonly sequence: number | null;
    readonly correlationId: string | null;
    readonly traceparent: string | null;
}
export interface ConsumerReceiptRecord extends ConsumerReceiptInput {
    readonly receiptId: string;
    readonly status: ConsumerReceiptStatus;
    readonly attempts: number;
    readonly errorCategory: ConsumerErrorCategory | null;
    readonly errorCode: string | null;
    readonly lastError: string | null;
    readonly skipReason: string | null;
    readonly resolvedBy: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
}
export interface ConsumerAggregateBlock {
    readonly consumerGroup: string;
    readonly tenantId: number | null;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly blockedReceiptId: string;
    readonly blockedEventId: string | null;
    readonly blockedSequence: number | null;
    readonly errorCode: string;
    readonly reason: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}
export interface ConsumerInspectFilter {
    readonly consumerGroup?: string;
    readonly status?: ConsumerReceiptStatus | readonly ConsumerReceiptStatus[];
    readonly tenantId?: number | null;
    readonly aggregateType?: string;
    readonly aggregateId?: string;
    readonly limit?: number;
}
export interface ConsumerInspectResult {
    readonly receipts: readonly ConsumerReceiptRecord[];
    readonly blockedAggregates: readonly ConsumerAggregateBlock[];
}
export type ConsumerPrepareDecision = {
    readonly action: 'process';
    readonly receiptId: string;
    readonly attempts: number;
} | {
    readonly action: 'parked';
    readonly receiptId: string;
} | {
    readonly action: 'already_resolved';
    readonly receiptId: string;
    readonly status: ConsumerReceiptStatus;
};
export interface ConsumerReceiptStore<Tx = unknown> {
    prepareInTx(tx: Tx, input: ConsumerReceiptInput): Promise<ConsumerPrepareDecision>;
    prepareBatchInTx?(tx: Tx, inputs: readonly ConsumerReceiptInput[]): Promise<readonly ConsumerPrepareDecision[] | null>;
    markProcessedInTx(tx: Tx, receiptId: string): Promise<void>;
    markProcessedBatchInTx?(tx: Tx, receiptIds: readonly string[]): Promise<void>;
    recordIgnored(input: ConsumerReceiptInput): Promise<ConsumerReceiptRecord>;
    recordQuarantined(input: ConsumerReceiptInput, failure: {
        readonly errorCode: string;
        readonly errorMessage: string;
    }): Promise<ConsumerReceiptRecord>;
    recordTransientAttempt(input: ConsumerReceiptInput, failure: {
        readonly attempts: number;
        readonly errorCode: string;
        readonly errorMessage: string;
    }): Promise<void>;
    recordPermanentFailure(input: ConsumerReceiptInput, failure: {
        readonly attempts: number;
        readonly errorCode: string;
        readonly errorMessage: string;
    }): Promise<ConsumerReceiptRecord>;
    inspect(filter?: ConsumerInspectFilter): Promise<ConsumerInspectResult>;
    getReceiptById(receiptId: string): Promise<ConsumerReceiptRecord | null>;
    markRetriedInTx(tx: Tx, receiptId: string, actor: string, reason?: string): Promise<ConsumerReceiptRecord>;
    markSkippedInTx(tx: Tx, receiptId: string, actor: string, reason: string): Promise<ConsumerReceiptRecord>;
    markSkipped(receiptId: string, actor: string, reason: string): Promise<ConsumerReceiptRecord>;
    listParkedForAggregate(filter: {
        readonly consumerGroup: string;
        readonly tenantId: number | null;
        readonly aggregateType: string;
        readonly aggregateId: string;
    }): Promise<readonly ConsumerReceiptRecord[]>;
    clearAggregateBlockIfResolved(filter: {
        readonly consumerGroup: string;
        readonly tenantId: number | null;
        readonly aggregateType: string;
        readonly aggregateId: string;
    }): Promise<boolean>;
}
export interface ConsumerSpec<Tx = unknown> {
    readonly name: string;
    readonly topic: string;
    readonly eventType: string;
    handle(event: EventEnvelope, tx: Tx, signal: AbortSignal): Promise<void>;
}
