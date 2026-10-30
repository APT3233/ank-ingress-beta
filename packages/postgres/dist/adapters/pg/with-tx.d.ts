import type { Catalogs } from '@ank-ingress/contracts';
import { type PgDatabase, type Tx } from './pool.js';
export interface WithTxOptions {
    readonly deadlineAt: number;
    readonly isolation?: 'read committed' | 'repeatable read';
    readonly readOnly?: boolean;
    readonly maxAttempts?: number;
    readonly signal: AbortSignal;
    readonly catalogs?: Catalogs;
    /**
     * Optional hook that executes the first query after BEGIN (which MUST include
     * `set_config('statement_timeout', $1, true)` to save a round-trip).
     */
    readonly hasCustomInitTimeout?: boolean;
    /**
     * Optional hook executed on the same connection immediately after COMMIT succeeds
     * before the connection is released back to the pool.
     */
    readonly afterCommit?: (tx: Tx, statementTimeoutMs: number) => Promise<void>;
}
export declare function withTx<T>(db: Pick<PgDatabase, 'gate'>, options: WithTxOptions, fn: (tx: Tx, statementTimeoutMs: number) => Promise<T>): Promise<T>;
