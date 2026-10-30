import { type Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { SecretHolder } from '@ank-ingress/config';
import type { Logger, MetricsRegistry } from '@ank-ingress/observability';
import { type PoolGate } from './pool-gate.js';
export interface PgConfig {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly password: string | SecretHolder;
    readonly maxConnections?: number;
    readonly maxWaiting?: number;
    readonly idleTimeoutMs?: number;
    readonly connectionTimeoutMs?: number;
}
export interface PgResource {
    readonly name: string;
    readonly required: boolean;
    check(signal?: AbortSignal): Promise<void>;
    close(): Promise<void>;
}
export interface PgDatabase {
    readonly pool: Pool;
    readonly gate: PoolGate;
    readonly resource: PgResource;
    close(): Promise<void>;
}
export interface CreatePgDatabaseOptions {
    readonly config: PgConfig;
    readonly applicationName: string;
    readonly logger: Logger;
    readonly metrics?: MetricsRegistry;
    readonly name?: string;
}
export interface Tx {
    readonly client: PoolClient;
    query<R extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
    readonly signal?: AbortSignal;
    cancel?(reason?: Error): void;
    afterCommit?(callback: () => void | Promise<void>): void;
    markSideEffect?(): void;
    queueBeforeCommit?(promise: Promise<unknown>): void;
}
/** Discard an owned connection immediately, including an active pg pipeline. */
export declare function discardPgClient(client: {
    release(error?: boolean | Error): void;
}): void;
export declare function createPgDatabase(options: CreatePgDatabaseOptions): PgDatabase;
