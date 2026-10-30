export interface LruTtlOptions {
    readonly maxEntries: number;
    readonly defaultTtlMs: number;
    readonly now?: () => number;
}
/**
 * Pure TypeScript O(1) Least-Recently-Used cache with per-entry TTL.
 * Uses Map iteration order (oldest first) for O(1) eviction and refresh.
 */
export declare class LruTtl<K, V> {
    private readonly maxEntries;
    private readonly defaultTtlMs;
    private readonly now;
    private readonly map;
    constructor(options: LruTtlOptions);
    get(key: K): V | undefined;
    set(key: K, value: V, ttlMs?: number): void;
    delete(key: K): boolean;
    clear(): void;
    get size(): number;
}
