export class InMemoryOutboxStore {
    totalShards;
    leases = new Map();
    rows = new Map();
    aggregateSeqs = new Map();
    nextToken = 1n;
    nextOrderIndex = 1;
    leaseClock = 1;
    retryBackoffMs;
    constructor(totalShards = 64, options) {
        this.totalShards = totalShards;
        this.retryBackoffMs = options?.retryBackoffMs ?? 0;
    }
    enqueue(record) {
        const recordId = record.recordId ?? record.id ?? record.eventId;
        const eventId = record.eventId ?? record.id ?? record.recordId;
        const aggKey = `${record.tenantId ?? 0}:${record.aggregateType}:${record.aggregateId}`;
        const nextSeq = record.sequence ?? (this.aggregateSeqs.get(aggKey) ?? 0) + 1;
        if (nextSeq > (this.aggregateSeqs.get(aggKey) ?? 0)) {
            this.aggregateSeqs.set(aggKey, nextSeq);
        }
        const normalized = {
            ...record,
            recordId,
            eventId,
            id: record.id ?? recordId,
            sequence: nextSeq,
        };
        this.rows.set(recordId, {
            record: normalized,
            status: 'PENDING',
            lastError: null,
            availableAt: 0,
            orderIndex: this.nextOrderIndex++,
        });
    }
    getStatus(id) {
        return this.rows.get(id)?.status;
    }
    shardHasReadyHead(shardId, now) {
        const heads = new Map();
        for (const row of this.rows.values()) {
            if (row.record.shardId !== shardId || row.status === 'PUBLISHED') {
                continue;
            }
            const aggKey = `${row.record.tenantId ?? 0}:${row.record.aggregateType}:${row.record.aggregateId}`;
            const existing = heads.get(aggKey);
            if (!existing ||
                (row.record.sequence ?? 0) < (existing.record.sequence ?? 0) ||
                ((row.record.sequence ?? 0) === (existing.record.sequence ?? 0) && row.orderIndex < existing.orderIndex)) {
                heads.set(aggKey, row);
            }
        }
        for (const head of heads.values()) {
            if (head.status === 'PENDING' && head.availableAt <= now) {
                return true;
            }
        }
        return false;
    }
    async lease(owner, maxShards, ttlMs) {
        const now = Date.now();
        const candidates = [];
        for (let shardId = 0; shardId < this.totalShards; shardId++) {
            const current = this.leases.get(shardId);
            if (!current || current.lease.expiresAt.getTime() <= now || current.lease.owner === owner) {
                candidates.push({
                    shardId,
                    hasWork: this.shardHasReadyHead(shardId, now),
                    leasedAt: current?.leasedAt ?? 0,
                });
            }
        }
        candidates.sort((a, b) => {
            if (a.hasWork !== b.hasWork)
                return a.hasWork ? -1 : 1;
            if (a.leasedAt !== b.leasedAt)
                return a.leasedAt - b.leasedAt;
            return a.shardId - b.shardId;
        });
        const acquired = [];
        for (let i = 0; i < candidates.length && acquired.length < maxShards; i++) {
            const { shardId } = candidates[i];
            const current = this.leases.get(shardId);
            const keepFencing = current && current.lease.owner === owner && current.lease.expiresAt.getTime() > now;
            const lease = {
                shardId,
                owner,
                fencingToken: keepFencing ? current.lease.fencingToken : this.nextToken++,
                expiresAt: new Date(now + ttlMs),
            };
            this.leases.set(shardId, {
                lease,
                leasedAt: this.leaseClock++,
            });
            acquired.push(lease);
        }
        return acquired;
    }
    async renew(lease, ttlMs) {
        const now = Date.now();
        const current = this.leases.get(lease.shardId);
        if (current &&
            current.lease.owner === lease.owner &&
            current.lease.fencingToken === lease.fencingToken &&
            current.lease.expiresAt.getTime() > now) {
            current.lease = {
                ...current.lease,
                expiresAt: new Date(now + ttlMs),
            };
            return true;
        }
        return false;
    }
    async fetch(lease, limit) {
        return this.fetchBatch([lease], limit);
    }
    async fetchBatch(leases, limit) {
        const now = Date.now();
        const validShards = new Set();
        for (const lease of leases) {
            const current = this.leases.get(lease.shardId);
            if (current &&
                current.lease.fencingToken === lease.fencingToken &&
                current.lease.expiresAt.getTime() > now) {
                validShards.add(lease.shardId);
            }
        }
        if (validShards.size === 0 || limit <= 0) {
            return [];
        }
        // Find unresolved head per aggregate across the valid leased shards
        const heads = new Map();
        for (const row of this.rows.values()) {
            if (!validShards.has(row.record.shardId) || row.status === 'PUBLISHED') {
                continue;
            }
            const aggKey = `${row.record.shardId}:${row.record.tenantId ?? 0}:${row.record.aggregateType}:${row.record.aggregateId}`;
            const existing = heads.get(aggKey);
            if (!existing ||
                (row.record.sequence ?? 0) < (existing.record.sequence ?? 0) ||
                ((row.record.sequence ?? 0) === (existing.record.sequence ?? 0) && row.orderIndex < existing.orderIndex)) {
                heads.set(aggKey, row);
            }
        }
        const readyHeads = [];
        for (const head of heads.values()) {
            if (head.status === 'PENDING' && head.availableAt <= now) {
                readyHeads.push(head);
            }
        }
        readyHeads.sort((a, b) => a.orderIndex - b.orderIndex);
        return readyHeads.slice(0, limit).map((r) => r.record);
    }
    async markPublished(lease, ids) {
        const now = Date.now();
        const current = this.leases.get(lease.shardId);
        if (!current ||
            current.lease.fencingToken !== lease.fencingToken ||
            current.lease.expiresAt.getTime() <= now) {
            return false;
        }
        for (const id of ids) {
            const row = this.rows.get(id);
            if (row && row.record.shardId === lease.shardId && row.status === 'PENDING') {
                row.status = 'PUBLISHED';
                row.record = { ...row.record, attempts: row.record.attempts + 1 };
            }
        }
        return true;
    }
    async markFailed(lease, id, error, dead) {
        const now = Date.now();
        const current = this.leases.get(lease.shardId);
        if (!current ||
            current.lease.fencingToken !== lease.fencingToken ||
            current.lease.expiresAt.getTime() <= now) {
            return false;
        }
        const row = this.rows.get(id);
        if (!row || row.record.shardId !== lease.shardId || row.status !== 'PENDING') {
            return false;
        }
        row.lastError = error;
        row.record = { ...row.record, attempts: row.record.attempts + 1 };
        if (dead) {
            row.status = 'DEAD';
        }
        else if (this.retryBackoffMs > 0) {
            row.availableAt = now + this.retryBackoffMs;
        }
        return true;
    }
    async release(lease) {
        const current = this.leases.get(lease.shardId);
        if (current && current.lease.fencingToken === lease.fencingToken) {
            current.lease = {
                ...current.lease,
                expiresAt: new Date(Date.now() - 1),
            };
        }
    }
}
