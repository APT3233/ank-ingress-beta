import { InMemoryConsumerReceiptState } from "./consumer-receipt-state.js";
export class InMemoryConsumerReceiptInspect extends InMemoryConsumerReceiptState {
    async inspect(filter) {
        const statuses = filter?.status
            ? Array.isArray(filter.status)
                ? new Set(filter.status)
                : new Set([filter.status])
            : null;
        let receipts = [...this.byId.values()].filter((r) => {
            if (filter?.consumerGroup && r.consumerGroup !== filter.consumerGroup)
                return false;
            if (statuses && !statuses.has(r.status))
                return false;
            if (filter?.tenantId !== undefined && r.tenantId !== filter.tenantId)
                return false;
            if (filter?.aggregateType && r.aggregateType !== filter.aggregateType)
                return false;
            if (filter?.aggregateId && r.aggregateId !== filter.aggregateId)
                return false;
            return true;
        });
        receipts.sort((a, b) => {
            const oa = BigInt(a.offset);
            const ob = BigInt(b.offset);
            if (oa !== ob)
                return oa < ob ? -1 : 1;
            return Number(a.receiptId) - Number(b.receiptId);
        });
        if (filter?.limit && filter.limit > 0) {
            receipts = receipts.slice(0, filter.limit);
        }
        const blockedAggregates = [...this.blocks.values()].filter((b) => {
            if (filter?.consumerGroup && b.consumerGroup !== filter.consumerGroup)
                return false;
            if (filter?.tenantId !== undefined && b.tenantId !== filter.tenantId)
                return false;
            if (filter?.aggregateType && b.aggregateType !== filter.aggregateType)
                return false;
            if (filter?.aggregateId && b.aggregateId !== filter.aggregateId)
                return false;
            return true;
        });
        return { receipts, blockedAggregates };
    }
    async getReceiptById(receiptId) {
        return this.byId.get(receiptId) ?? null;
    }
    async listParkedForAggregate(filter) {
        const list = [...this.byId.values()].filter((r) => r.consumerGroup === filter.consumerGroup &&
            (r.tenantId ?? 0) === (filter.tenantId ?? 0) &&
            r.aggregateType === filter.aggregateType &&
            r.aggregateId === filter.aggregateId &&
            r.status === 'PARKED');
        list.sort((a, b) => {
            const sa = a.sequence ?? Number.MAX_SAFE_INTEGER;
            const sb = b.sequence ?? Number.MAX_SAFE_INTEGER;
            if (sa !== sb)
                return sa - sb;
            const oa = BigInt(a.offset);
            const ob = BigInt(b.offset);
            return oa < ob ? -1 : oa > ob ? 1 : 0;
        });
        return list;
    }
}
