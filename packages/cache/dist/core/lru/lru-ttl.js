/**
 * Pure TypeScript O(1) Least-Recently-Used cache with per-entry TTL.
 * Uses Map iteration order (oldest first) for O(1) eviction and refresh.
 */
export class LruTtl {
    maxEntries;
    defaultTtlMs;
    now;
    map = new Map();
    constructor(options) {
        if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries < 1) {
            throw new TypeError('maxEntries must be a positive safe integer');
        }
        if (!Number.isFinite(options.defaultTtlMs) || options.defaultTtlMs < 1) {
            throw new TypeError('defaultTtlMs must be positive');
        }
        this.maxEntries = options.maxEntries;
        this.defaultTtlMs = options.defaultTtlMs;
        this.now = options.now ?? Date.now;
    }
    get(key) {
        const entry = this.map.get(key);
        if (entry === undefined) {
            return undefined;
        }
        if (entry.expiresAt <= this.now()) {
            this.map.delete(key);
            return undefined;
        }
        // Refresh LRU order in O(1)
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }
    set(key, value, ttlMs = this.defaultTtlMs) {
        const expiresAt = this.now() + ttlMs;
        if (this.map.has(key)) {
            this.map.delete(key);
        }
        else if (this.map.size >= this.maxEntries) {
            const oldestKey = this.map.keys().next().value;
            if (oldestKey !== undefined) {
                this.map.delete(oldestKey);
            }
        }
        this.map.set(key, { value, expiresAt });
    }
    delete(key) {
        return this.map.delete(key);
    }
    clear() {
        this.map.clear();
    }
    get size() {
        const current = this.now();
        for (const [k, v] of this.map) {
            if (v.expiresAt <= current) {
                this.map.delete(k);
            }
        }
        return this.map.size;
    }
}
