import type { InboxStore, OutboxRecord, OutboxStore } from '@ank-ingress/contracts';
export declare function runOutboxInboxContractSuite<Tx>(options: {
    name: string;
    withTx: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
    createInbox: () => InboxStore<Tx>;
    createOutbox: () => {
        store: OutboxStore;
        seed: (record: OutboxRecord) => Promise<void>;
    };
}): void;
