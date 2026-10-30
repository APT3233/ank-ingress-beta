export interface ShardLease {
    readonly shardId: number;
    readonly owner: string;
    readonly fencingToken: bigint;
    readonly expiresAt: Date;
}
export interface OutboxRecord {
    readonly recordId: string;
    readonly eventId: string;
    /** Legacy alias when seeding in-memory fixtures; OutboxPublisher always uses eventId for envelope and recordId for store updates. */
    readonly id?: string;
    readonly shardId: number;
    readonly topic: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly sequence?: number;
    readonly tenantId: number | null;
    readonly eventType: string;
    readonly eventVersion: number;
    readonly correlationId: string;
    readonly traceparent: string | null;
    readonly payload: unknown;
    readonly occurredAt: string;
    readonly attempts: number;
}
export interface OutboxStore {
    lease(owner: string, maxShards: number, ttlMs: number): Promise<ShardLease[]>;
    fetch(lease: ShardLease, limit: number): Promise<OutboxRecord[]>;
    fetchBatch?(leases: readonly ShardLease[], limit: number): Promise<OutboxRecord[]>;
    markPublished(lease: ShardLease, recordIds: readonly string[]): Promise<boolean>;
    markPublishedBatch?(entries: readonly {
        readonly lease: ShardLease;
        readonly recordIds: readonly string[];
    }[]): Promise<number>;
    markFailed(lease: ShardLease, recordId: string, error: string, dead: boolean): Promise<boolean>;
    renew?(lease: ShardLease, ttlMs: number): Promise<boolean>;
    renewBatch?(leases: readonly ShardLease[], ttlMs: number): Promise<void>;
    release?(lease: ShardLease): Promise<void>;
    releaseBatch?(leases: readonly ShardLease[]): Promise<void>;
}
export interface InboxStore<Tx> {
    record(tx: Tx, consumer: string, eventId: string): Promise<boolean>;
    recordBatch?(tx: Tx, entries: readonly {
        readonly consumer: string;
        readonly eventId: string;
    }[]): Promise<readonly boolean[]>;
}
