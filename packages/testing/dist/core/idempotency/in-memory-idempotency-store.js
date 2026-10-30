export class InMemoryIdempotencyStore {
    entries = new Map();
    nowMs = Date.now();
    advanceTimeMs(deltaMs) {
        this.nowMs += deltaMs;
    }
    compositeKey(k) {
        return `${k.tenantId}:${k.accountId}:${k.operation}:${k.key}`;
    }
    async claim(_tx, key) {
        const ck = this.compositeKey(key);
        const existing = this.entries.get(ck);
        const ttlMs = (key.ttlSeconds ?? 86_400) * 1000;
        if (!existing || existing.expiresAtMs <= this.nowMs) {
            this.entries.set(ck, {
                requestHash: key.requestHash,
                status: 'PENDING',
                expiresAtMs: this.nowMs + ttlMs,
            });
            return { kind: 'fresh' };
        }
        if (existing.requestHash !== key.requestHash) {
            return { kind: 'mismatch' };
        }
        if (existing.status === 'PENDING' || !existing.result) {
            return { kind: 'pending' };
        }
        return { kind: 'replay', result: existing.result };
    }
    async save(_tx, key, result) {
        const ck = this.compositeKey(key);
        const existing = this.entries.get(ck);
        const ttlMs = (key.ttlSeconds ?? 86_400) * 1000;
        this.entries.set(ck, {
            requestHash: key.requestHash,
            status: 'COMPLETED',
            result,
            expiresAtMs: existing?.expiresAtMs ?? this.nowMs + ttlMs,
        });
    }
}
