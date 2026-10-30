import type { ConsumerInspectFilter, ConsumerInspectResult, ConsumerReceiptRecord } from '@ank-ingress/contracts';
import { InMemoryConsumerReceiptState } from './consumer-receipt-state.js';
export declare abstract class InMemoryConsumerReceiptInspect extends InMemoryConsumerReceiptState {
    inspect(filter?: ConsumerInspectFilter): Promise<ConsumerInspectResult>;
    getReceiptById(receiptId: string): Promise<ConsumerReceiptRecord | null>;
    listParkedForAggregate(filter: {
        readonly consumerGroup: string;
        readonly tenantId: number | null;
        readonly aggregateType: string;
        readonly aggregateId: string;
    }): Promise<readonly ConsumerReceiptRecord[]>;
}
