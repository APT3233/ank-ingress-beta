import { randomUUID } from 'node:crypto';
import { defineScript } from "./scripts.js";
const RELEASE_LOCK_SCRIPT = defineScript('ank_release_lock', `if redis.call("get", KEYS[1]) == ARGV[1] then
     return redis.call("del", KEYS[1])
   else
     return 0
   end`, 1);
/**
 * Best-effort distributed lock backed by a single Redis instance (`SET NX PX` + Lua token check).
 *
 * IMPORTANT: Do NOT use `RedisLock` as a source of business correctness or financial/data integrity.
 * Clock drift, GC pauses, or Redis failover can violate mutual exclusion. Always enforce business
 * invariants in PostgreSQL using constraints, row locks, or fencing tokens (e.g., `ShardLease.fencingToken`).
 */
export class RedisLock {
    client;
    constructor(client) {
        this.client = client;
    }
    async acquire(key, ttlMs) {
        const token = randomUUID();
        const res = await this.client.set(key, token, {
            NX: true,
            PX: ttlMs,
        });
        if (res !== 'OK') {
            return null;
        }
        return {
            key,
            token,
            release: () => this.releaseWithToken(key, token),
        };
    }
    async releaseWithToken(key, token) {
        const deleted = await RELEASE_LOCK_SCRIPT.exec(this.client, [key], [token]);
        return Number(deleted) === 1;
    }
}
