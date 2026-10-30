import type { ConsumerAggregateBlock, ConsumerReceiptInput, ConsumerReceiptRecord } from '@ank-ingress/contracts';
export declare abstract class InMemoryConsumerReceiptState {
    private nextId;
    protected readonly byId: Map<string, ConsumerReceiptRecord>;
    protected readonly byCoord: Map<string, string>;
    protected readonly blocks: Map<string, ConsumerAggregateBlock>;
    private readonly locks;
    protected coordKey(input: {
        readonly consumerGroup: string;
        readonly topic: string;
        readonly partition: number;
        readonly offset: string;
    }): string;
    protected aggKey(input: {
        readonly consumerGroup: string;
        readonly tenantId: number | null;
        readonly aggregateType: string;
        readonly aggregateId: string;
    }): string;
    protected acquireKeyLock(key: string): Promise<() => void>;
    protected upsertRecord(input: ConsumerReceiptInput, patch: Partial<Pick<ConsumerReceiptRecord, 'status' | 'attempts' | 'errorCategory' | 'errorCode' | 'lastError' | 'skipReason' | 'resolvedBy'>>): ConsumerReceiptRecord;
}
