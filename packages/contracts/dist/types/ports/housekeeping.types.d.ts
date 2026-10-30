export interface HousekeepingReapResult {
    readonly reapedJobs: number;
    readonly reapedCalculations: number;
    readonly expiredReservations: number;
}
export interface HousekeepingPurgeResult {
    readonly purgedOutbox: number;
    readonly purgedInbox: number;
    readonly purgedReceipts?: number;
    readonly purgedIdempotencyKeys?: number;
    readonly purgedRevocations?: number;
}
export interface HousekeepingStore {
    reapExpiredLeases(limit?: number): Promise<HousekeepingReapResult>;
    purgeExpiredEvents(options?: {
        readonly outboxOlderThanMs?: number;
        readonly inboxOlderThanMs?: number;
        readonly batchSize?: number;
    }): Promise<HousekeepingPurgeResult>;
}
