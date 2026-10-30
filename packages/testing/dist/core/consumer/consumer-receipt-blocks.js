import { InMemoryConsumerReceiptInspect } from "./consumer-receipt-inspect.js";
export class InMemoryConsumerReceiptBlocks extends InMemoryConsumerReceiptInspect {
    async recordPermanentFailure(input, failure) {
        const rec = this.upsertRecord(input, {
            status: 'BLOCKED',
            attempts: failure.attempts,
            errorCategory: 'PERMANENT',
            errorCode: failure.errorCode,
            lastError: failure.errorMessage,
        });
        if (input.aggregateType && input.aggregateId) {
            const aKey = this.aggKey({
                consumerGroup: input.consumerGroup,
                tenantId: input.tenantId,
                aggregateType: input.aggregateType,
                aggregateId: input.aggregateId,
            });
            const existingBlock = this.blocks.get(aKey);
            const now = new Date().toISOString();
            this.blocks.set(aKey, {
                consumerGroup: input.consumerGroup,
                tenantId: input.tenantId,
                aggregateType: input.aggregateType,
                aggregateId: input.aggregateId,
                blockedReceiptId: existingBlock?.blockedReceiptId ?? rec.receiptId,
                blockedEventId: existingBlock?.blockedEventId ?? input.eventId,
                blockedSequence: existingBlock?.blockedSequence ?? input.sequence,
                errorCode: failure.errorCode,
                reason: failure.errorMessage,
                createdAt: existingBlock?.createdAt ?? now,
                updatedAt: now,
            });
        }
        return rec;
    }
    async markSkippedInTx(tx, receiptId, actor, reason) {
        const existing = this.byId.get(receiptId);
        if (!existing) {
            throw new Error(`Consumer receipt ${receiptId} not found`);
        }
        const updated = {
            ...existing,
            status: 'SKIPPED',
            resolvedBy: actor,
            skipReason: reason,
            updatedAt: new Date().toISOString(),
        };
        this.byId.set(receiptId, updated);
        const blockKey = existing.aggregateType && existing.aggregateId ? this.aggKey({
            consumerGroup: existing.consumerGroup, tenantId: existing.tenantId,
            aggregateType: existing.aggregateType, aggregateId: existing.aggregateId,
        }) : null;
        const previousBlock = blockKey ? this.blocks.get(blockKey) : undefined;
        const maybeTx = tx;
        maybeTx?.onRollback?.push(() => {
            this.byId.set(receiptId, existing);
            if (blockKey && previousBlock)
                this.blocks.set(blockKey, previousBlock);
        });
        if (existing.aggregateType && existing.aggregateId) {
            await this.clearAggregateBlockIfResolved({
                consumerGroup: existing.consumerGroup,
                tenantId: existing.tenantId,
                aggregateType: existing.aggregateType,
                aggregateId: existing.aggregateId,
            });
        }
        return updated;
    }
    async markSkipped(receiptId, actor, reason) {
        return this.markSkippedInTx({}, receiptId, actor, reason);
    }
    async clearAggregateBlockIfResolved(filter) {
        const hasUnresolved = [...this.byId.values()].some((r) => r.consumerGroup === filter.consumerGroup &&
            (r.tenantId ?? 0) === (filter.tenantId ?? 0) &&
            r.aggregateType === filter.aggregateType &&
            r.aggregateId === filter.aggregateId &&
            (r.status === 'BLOCKED' || r.status === 'PARKED'));
        const aKey = this.aggKey(filter);
        if (!hasUnresolved) {
            this.blocks.delete(aKey);
            return true;
        }
        return false;
    }
}
