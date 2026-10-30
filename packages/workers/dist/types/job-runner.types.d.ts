import type { HousekeepingPurgeResult, HousekeepingReapResult, HousekeepingStore, JobHandlerSpec, JobStore } from '@ank-ingress/contracts';
import type { Logger, MetricsRegistry } from '@ank-ingress/observability';
import type { Inbound } from '@ank-ingress/runtime';
export interface JobRunnerHousekeepingOptions {
    readonly store: HousekeepingStore;
    readonly reapIntervalMs?: number;
    readonly reapBatchSize?: number;
    readonly purgeIntervalMs?: number;
    readonly purgeBatchSize?: number;
    readonly outboxRetentionMs?: number;
    readonly inboxRetentionMs?: number;
    readonly replayWindowMs?: number;
    readonly maxPurgeBatchesPerTick?: number;
}
export interface JobRunnerOptions {
    readonly jobStore: JobStore;
    readonly handlers: readonly JobHandlerSpec<any, any>[];
    readonly workerId: string;
    readonly concurrency?: number;
    readonly batchSize?: number;
    readonly pollIntervalMs?: number;
    readonly leaseMs?: number;
    readonly jobTimeoutMs?: number;
    readonly retryBackoffBaseMs?: number;
    readonly housekeeping?: JobRunnerHousekeepingOptions;
    readonly logger?: Logger;
    readonly metrics?: MetricsRegistry;
}
export interface JobRunner extends Inbound {
    runReapOnce(): Promise<HousekeepingReapResult>;
    runPurgeOnce(): Promise<HousekeepingPurgeResult>;
}
