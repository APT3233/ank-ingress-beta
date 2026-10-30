/**
 * Fixed-window counters in this process only. Each process (and uWS worker) counts separately,
 * so use the Redis store from `@ank-ingress/cache` when the limit must hold across instances.
 */
export function createMemoryRateLimitStore(options = {}) {
    const maxKeys = options.maxKeys ?? 10_000;
    const now = options.now ?? Date.now;
    const windows = new Map();
    const sweep = (at) => {
        for (const [key, entry] of windows) {
            if (entry.resetAt <= at)
                windows.delete(key);
        }
        for (const key of windows.keys()) {
            if (windows.size < maxKeys)
                break;
            windows.delete(key);
        }
    };
    return {
        async consume(request) {
            const at = now();
            const key = `${request.bucket}\0${request.windowMs}\0${request.subject}`;
            let entry = windows.get(key);
            if (entry === undefined || entry.resetAt <= at) {
                if (entry === undefined && windows.size >= maxKeys)
                    sweep(at);
                entry = { count: 0, resetAt: at + request.windowMs };
                windows.set(key, entry);
            }
            entry.count += 1;
            if (entry.count <= request.limit) {
                return { allowed: true, remaining: request.limit - entry.count, retryAfterMs: 0 };
            }
            return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - at };
        },
    };
}
