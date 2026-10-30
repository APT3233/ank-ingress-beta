import type { InboxStore } from '@ank-ingress/contracts';
export declare class InMemoryInboxStore<Tx = unknown> implements InboxStore<Tx> {
    private readonly seen;
    record(tx: Tx, consumer: string, eventId: string): Promise<boolean>;
    withTx<T>(fn: (tx: {
        onRollback: Array<() => void>;
        onCommit: Array<() => void>;
        onFinally: Array<() => void>;
    }) => Promise<T>): Promise<T>;
}
