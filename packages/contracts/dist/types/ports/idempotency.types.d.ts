import type { ReplyHeaders } from '../http/reply.types.js';
export interface IdempotencyKey {
    readonly tenantId: number | null;
    readonly accountId: string;
    readonly operation: string;
    readonly key: string;
    readonly requestHash: string;
    readonly ttlSeconds?: number;
}
export interface StoredResult {
    readonly status: number;
    readonly body: unknown;
    readonly kind?: 'json' | 'empty';
    readonly headers?: ReplyHeaders;
}
export type IdempotencyClaimResult = {
    readonly kind: 'fresh';
} | {
    readonly kind: 'replay';
    readonly result: StoredResult;
} | {
    readonly kind: 'mismatch';
} | {
    readonly kind: 'pending';
};
export interface IdempotencyStore<Tx> {
    claim(tx: Tx, key: IdempotencyKey): Promise<IdempotencyClaimResult>;
    save(tx: Tx, key: IdempotencyKey, result: StoredResult): Promise<void>;
}
