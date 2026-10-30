import type { RedisClient } from './redis-client.js';
export interface LockLease {
    readonly key: string;
    readonly token: string;
    release(): Promise<boolean>;
}
/**
 * Best-effort distributed lock backed by a single Redis instance (`SET NX PX` + Lua token check).
 *
 * IMPORTANT: Do NOT use `RedisLock` as a source of business correctness or financial/data integrity.
 * Clock drift, GC pauses, or Redis failover can violate mutual exclusion. Always enforce business
 * invariants in PostgreSQL using constraints, row locks, or fencing tokens (e.g., `ShardLease.fencingToken`).
 */
export declare class RedisLock {
    private readonly client;
    constructor(client: RedisClient);
    acquire(key: string, ttlMs: number): Promise<LockLease | null>;
    releaseWithToken(key: string, token: string): Promise<boolean>;
}
