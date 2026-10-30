export class InMemoryConsumerReceiptState {
    nextId = 1;
    byId = new Map();
    byCoord = new Map();
    blocks = new Map();
    locks = new Map();
    coordKey(input) {
        return `${input.consumerGroup}:${input.topic}:${input.partition}:${input.offset}`;
    }
    aggKey(input) {
        return `${input.consumerGroup}:${input.tenantId ?? 0}:${input.aggregateType}:${input.aggregateId}`;
    }
    async acquireKeyLock(key) {
        while (this.locks.has(key)) {
            await this.locks.get(key);
        }
        let release;
        const promise = new Promise((res) => {
            release = () => {
                if (this.locks.get(key) === promise) {
                    this.locks.delete(key);
                }
                res();
            };
        });
        this.locks.set(key, promise);
        return release;
    }
    upsertRecord(input, patch) {
        const cKey = this.coordKey(input);
        const existingId = this.byCoord.get(cKey);
        const existing = existingId ? this.byId.get(existingId) : undefined;
        const now = new Date().toISOString();
        const receiptId = existing?.receiptId ?? String(this.nextId++);
        const updated = {
            ...input,
            receiptId,
            status: patch.status ?? existing?.status ?? 'PENDING',
            attempts: patch.attempts ?? existing?.attempts ?? 0,
            errorCategory: patch.errorCategory !== undefined ? patch.errorCategory : (existing?.errorCategory ?? null),
            errorCode: patch.errorCode !== undefined ? patch.errorCode : (existing?.errorCode ?? null),
            lastError: patch.lastError !== undefined ? patch.lastError : (existing?.lastError ?? null),
            skipReason: patch.skipReason !== undefined ? patch.skipReason : (existing?.skipReason ?? null),
            resolvedBy: patch.resolvedBy !== undefined ? patch.resolvedBy : (existing?.resolvedBy ?? null),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        this.byId.set(receiptId, updated);
        this.byCoord.set(cKey, receiptId);
        return updated;
    }
}
