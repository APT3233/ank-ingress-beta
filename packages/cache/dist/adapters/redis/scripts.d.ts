import type { RedisClient } from './redis-client.js';
export interface RedisScript<TResult = unknown> {
    readonly name: string;
    readonly sha1: string;
    readonly numKeys: number;
    exec(client: RedisClient, keys: readonly string[], args: readonly string[]): Promise<TResult>;
}
export declare function defineScript<TResult = unknown>(name: string, lua: string, numKeys: number): RedisScript<TResult>;
