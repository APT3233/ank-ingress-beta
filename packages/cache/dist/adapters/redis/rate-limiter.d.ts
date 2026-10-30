import type { RateLimitStore } from '@ank-ingress/contracts';
import type { RedisClient } from './redis-client.js';
export interface RateLimiterOptions {
    readonly redis: RedisClient;
    readonly windowMs: number;
    readonly limit: number;
    readonly prefix: string;
}
export interface RateLimitResult {
    readonly allowed: boolean;
    readonly remaining: number;
    readonly retryAfterMs: number;
}
export interface RateLimiter {
    consume(subject: string): Promise<RateLimitResult>;
}
export declare function createRateLimiter(options: RateLimiterOptions): RateLimiter;
/** Shared fixed-window counters for route `rateLimit` (pass as `createHttpApp({ rateLimit })`). */
export declare function createRedisRateLimitStore(options: {
    readonly redis: RedisClient;
    readonly prefix: string;
}): RateLimitStore;
