import type { SecretHolder } from '@ank-ingress/config';
import type { Resource } from '@ank-ingress/runtime';
declare function makeRawClient(url: string, baseMs: number, connectTimeoutMs: number): import("redis").RedisClientType<{}, {}, {}, 3, {}>;
export type RedisClient = ReturnType<typeof makeRawClient>;
export interface RedisConfig {
    readonly url: string | SecretHolder;
    readonly name?: string;
    readonly required?: boolean;
    readonly reconnectBaseMs?: number;
    readonly connectTimeoutMs?: number;
}
export interface RedisBundle {
    readonly cmd: RedisClient;
    readonly sub: RedisClient;
    readonly blocking: RedisClient;
    readonly resource: Resource;
}
export declare function createRedis(config: RedisConfig): Promise<RedisBundle>;
export {};
