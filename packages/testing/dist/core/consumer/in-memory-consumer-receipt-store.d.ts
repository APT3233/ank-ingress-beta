import type { ConsumerPrepareDecision, ConsumerReceiptInput, ConsumerReceiptRecord, ConsumerReceiptStore } from '@ank-ingress/contracts';
import { InMemoryConsumerReceiptBlocks } from './consumer-receipt-blocks.js';
export declare class InMemoryConsumerReceiptStore<Tx = unknown> extends InMemoryConsumerReceiptBlocks<Tx> implements ConsumerReceiptStore<Tx> {
    prepareInTx(tx: Tx, input: ConsumerReceiptInput): Promise<ConsumerPrepareDecision>;
    markProcessedInTx(tx: Tx, receiptId: string): Promise<void>;
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
    markRetriedInTx(tx: Tx, receiptId: string, actor: string, reason?: string): Promise<ConsumerReceiptRecord>;
}
