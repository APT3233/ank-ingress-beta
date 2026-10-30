import type { TestContext } from 'node:test';
import type { IdempotencyStore } from '@ank-ingress/contracts';
export interface IdempotencyStoreFixture<Tx> {
    readonly store: IdempotencyStore<Tx>;
    withTx<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
    advanceTimeMs?(ms: number): void | Promise<void>;
}
export declare function runIdempotencyStoreContractSuite<Tx>(t: TestContext, createFixture: () => Promise<IdempotencyStoreFixture<Tx>>): Promise<void>;
