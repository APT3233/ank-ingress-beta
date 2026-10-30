import type { OutboxRecord, OutboxStore, ShardLease } from '@ank-ingress/contracts';
export declare class InMemoryOutboxStore implements OutboxStore {
    private readonly totalShards;
    private readonly leases;
    private readonly rows;
    private readonly aggregateSeqs;
    private nextToken;
    private nextOrderIndex;
    private leaseClock;
    private readonly retryBackoffMs;
    constructor(totalShards?: number, options?: {
        retryBackoffMs?: number;
    });
    enqueue(record: OutboxRecord): void;
    getStatus(id: string): 'PENDING' | 'PUBLISHED' | 'DEAD' | undefined;
    private shardHasReadyHead;
    lease(owner: string, maxShards: number, ttlMs: number): Promise<ShardLease[]>;
    renew(lease: ShardLease, ttlMs: number): Promise<boolean>;
    fetch(lease: ShardLease, limit: number): Promise<OutboxRecord[]>;
    fetchBatch(leases: readonly ShardLease[], limit: number): Promise<OutboxRecord[]>;
    markPublished(lease: ShardLease, ids: readonly string[]): Promise<boolean>;
    markFailed(lease: ShardLease, id: string, error: string, dead: boolean): Promise<boolean>;
    release(lease: ShardLease): Promise<void>;
}
