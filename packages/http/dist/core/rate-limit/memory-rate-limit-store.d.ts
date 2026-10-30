import type { RateLimitStore } from '@ank-ingress/contracts';
export interface MemoryRateLimitStoreOptions {
    /** Upper bound on tracked counters; expired ones are swept first, then the oldest are dropped. */
    readonly maxKeys?: number;
    readonly now?: () => number;
}
/**
 * Fixed-window counters in this process only. Each process (and uWS worker) counts separately,
 * so use the Redis store from `@ank-ingress/cache` when the limit must hold across instances.
 */
export declare function createMemoryRateLimitStore(options?: MemoryRateLimitStoreOptions): RateLimitStore;
