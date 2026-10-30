import type { ConsumerReceiptInput, ConsumerReceiptRecord } from '@ank-ingress/contracts';
import { InMemoryConsumerReceiptInspect } from './consumer-receipt-inspect.js';
export declare abstract class InMemoryConsumerReceiptBlocks<Tx = unknown> extends InMemoryConsumerReceiptInspect {
    recordPermanentFailure(input: ConsumerReceiptInput, failure: {
        readonly attempts: number;
        readonly errorCode: string;
        readonly errorMessage: string;
    }): Promise<ConsumerReceiptRecord>;
    markSkippedInTx(tx: Tx, receiptId: string, actor: string, reason: string): Promise<ConsumerReceiptRecord>;
    markSkipped(receiptId: string, actor: string, reason: string): Promise<ConsumerReceiptRecord>;
    clearAggregateBlockIfResolved(filter: {
        readonly consumerGroup: string;
        readonly tenantId: number | null;
        readonly aggregateType: string;
        readonly aggregateId: string;
    }): Promise<boolean>;
}
