import { InMemoryConsumerReceiptBlocks } from "./consumer-receipt-blocks.js";
export class InMemoryConsumerReceiptStore extends InMemoryConsumerReceiptBlocks {
    async prepareInTx(tx, input) {
        const cKey = this.coordKey(input);
        const releaseCoord = await this.acquireKeyLock(`coord:${cKey}`);
        let releaseAgg = null;
        if (input.aggregateType && input.aggregateId) {
            const aKey = this.aggKey({
                consumerGroup: input.consumerGroup,
                tenantId: input.tenantId,
                aggregateType: input.aggregateType,
                aggregateId: input.aggregateId,
            });
            releaseAgg = await this.acquireKeyLock(`agg:${aKey}`);
        }
        const releaseAll = () => {
            releaseAgg?.();
            releaseCoord();
        };
        const existingId = this.byCoord.get(cKey);
        const prev = existingId ? this.byId.get(existingId) : undefined;
        if (prev &&
            (prev.status === 'PROCESSED' ||
                prev.status === 'IGNORED' ||
                prev.status === 'PARKED' ||
                prev.status === 'BLOCKED' ||
                prev.status === 'QUARANTINED' ||
                prev.status === 'SKIPPED')) {
            releaseAll();
            return { action: 'already_resolved', receiptId: prev.receiptId, status: prev.status };
        }
        if (input.eventId) {
            const existingByEvent = [...this.byId.values()].find((r) => r.consumerGroup === input.consumerGroup &&
                r.eventId === input.eventId &&
                r.receiptId !== prev?.receiptId &&
                (r.status === 'PROCESSED' ||
                    r.status === 'IGNORED' ||
                    r.status === 'PARKED' ||
                    r.status === 'BLOCKED' ||
                    r.status === 'QUARANTINED' ||
                    r.status === 'SKIPPED'));
            if (existingByEvent) {
                releaseAll();
                return {
                    action: 'already_resolved',
                    receiptId: existingByEvent.receiptId,
                    status: existingByEvent.status,
                };
            }
        }
        if (input.aggregateType && input.aggregateId) {
            const aKey = this.aggKey({
                consumerGroup: input.consumerGroup,
                tenantId: input.tenantId,
                aggregateType: input.aggregateType,
                aggregateId: input.aggregateId,
            });
            const hasBlock = this.blocks.has(aKey);
            const hasEarlierUnresolved = [...this.byId.values()].some((r) => r.consumerGroup === input.consumerGroup &&
                (r.tenantId ?? 0) === (input.tenantId ?? 0) &&
                r.aggregateType === input.aggregateType &&
                r.aggregateId === input.aggregateId &&
                r.receiptId !== prev?.receiptId &&
                (r.status === 'BLOCKED' || r.status === 'PARKED'));
            if (hasBlock || hasEarlierUnresolved) {
                const parked = this.upsertRecord(input, {
                    status: 'PARKED',
                    attempts: prev?.attempts ?? 0,
                });
                releaseAll();
                return { action: 'parked', receiptId: parked.receiptId };
            }
        }
        const nextAttempts = (prev?.attempts ?? 0) + 1;
        const pending = this.upsertRecord(input, {
            status: 'PENDING',
            attempts: nextAttempts,
        });
        const maybeTx = tx;
        if (maybeTx && typeof maybeTx === 'object') {
            if (Array.isArray(maybeTx.onRollback)) {
                maybeTx.onRollback.push(() => {
                    if (prev) {
                        this.byId.set(prev.receiptId, prev);
                    }
                    else {
                        this.byId.delete(pending.receiptId);
                        this.byCoord.delete(cKey);
                    }
                });
            }
            if (Array.isArray(maybeTx.onFinally)) {
                maybeTx.onFinally.push(releaseAll);
            }
            else {
                releaseAll();
            }
        }
        else {
            releaseAll();
        }
        return { action: 'process', receiptId: pending.receiptId, attempts: nextAttempts };
    }
    async markProcessedInTx(tx, receiptId) {
        const existing = this.byId.get(receiptId);
        if (!existing)
            return;
        const updated = {
            ...existing,
            status: 'PROCESSED',
            errorCategory: null,
            errorCode: null,
            lastError: null,
            updatedAt: new Date().toISOString(),
        };
        this.byId.set(receiptId, updated);
        const maybeTx = tx;
        if (maybeTx && typeof maybeTx === 'object' && Array.isArray(maybeTx.onRollback)) {
            maybeTx.onRollback.push(() => {
                this.byId.set(receiptId, existing);
            });
        }
    }
    async recordIgnored(input) {
        return this.upsertRecord(input, {
            status: 'IGNORED',
            attempts: 1,
            errorCategory: null,
            errorCode: null,
            lastError: null,
        });
    }
    async recordQuarantined(input, failure) {
        return this.upsertRecord(input, {
            status: 'QUARANTINED',
            attempts: 1,
            errorCategory: 'QUARANTINE',
            errorCode: failure.errorCode,
            lastError: failure.errorMessage,
        });
    }
    async recordTransientAttempt(input, failure) {
        this.upsertRecord(input, {
            status: 'PENDING',
            attempts: failure.attempts,
            errorCategory: 'TRANSIENT',
            errorCode: failure.errorCode,
            lastError: failure.errorMessage,
        });
    }
    async markRetriedInTx(tx, receiptId, actor, reason) {
        const existing = this.byId.get(receiptId);
        if (!existing) {
            throw new Error(`Consumer receipt ${receiptId} not found`);
        }
        const updated = {
            ...existing,
            status: 'PROCESSED',
            resolvedBy: actor,
            skipReason: reason ?? existing.skipReason,
            errorCategory: null,
            errorCode: null,
            lastError: null,
            updatedAt: new Date().toISOString(),
        };
        this.byId.set(receiptId, updated);
        const maybeTx = tx;
        if (maybeTx && typeof maybeTx === 'object' && Array.isArray(maybeTx.onRollback)) {
            maybeTx.onRollback.push(() => {
                this.byId.set(receiptId, existing);
            });
        }
        return updated;
    }
}
