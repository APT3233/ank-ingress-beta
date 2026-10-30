import type { IdempotencyClaimResult, IdempotencyKey, IdempotencyStore, StoredResult } from '@ank-ingress/contracts';
export declare class InMemoryIdempotencyStore implements IdempotencyStore<unknown> {
    private readonly entries;
    private nowMs;
    advanceTimeMs(deltaMs: number): void;
    private compositeKey;
    claim(_tx: unknown, key: IdempotencyKey): Promise<IdempotencyClaimResult>;
    save(_tx: unknown, key: IdempotencyKey, result: StoredResult): Promise<void>;
}
