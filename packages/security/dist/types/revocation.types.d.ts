import type { RevocationSource, TokenClaims } from '@ank-ingress/contracts';
import type { Resource } from '@ank-ingress/runtime';
export interface RevocationPubSubBus {
    subscribe(channel: string, handler: (payload: string) => void): (() => void | Promise<void>) | Promise<() => void | Promise<void>>;
    isConnected?(): boolean;
    isHealthy?(): boolean;
}
export interface RevocationCacheOptions<Tx = unknown> {
    readonly source: RevocationSource<Tx>;
    readonly ttlMs?: number;
    readonly max?: number;
    readonly loadTimeoutMs?: number;
    readonly bus?: RevocationPubSubBus;
    readonly channel?: string;
}
export interface RevocationCache<Tx = unknown> {
    check(claims: TokenClaims, signal: AbortSignal, tx?: Tx): Promise<void>;
    checkCached?(claims: TokenClaims): boolean;
    invalidate(jtiOrSub: string): void;
    readonly resource: Resource;
}
