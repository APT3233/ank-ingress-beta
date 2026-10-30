import type { HousekeepingPurgeResult, HousekeepingReapResult } from '@ank-ingress/contracts';
import type { Logger } from '@ank-ingress/observability';
import type { JobRunnerHousekeepingOptions } from '../../types/job-runner.types.js';
import type { WorkerMetricsHandles } from './worker-metrics.js';
export interface HousekeepingLoopConfig {
    readonly hk: JobRunnerHousekeepingOptions | undefined;
    readonly workerId: string;
    readonly logger: Logger | undefined;
    readonly metricsHandles: WorkerMetricsHandles | null;
    readonly reapIntervalMs: number;
    readonly reapBatchSize: number;
    readonly purgeIntervalMs: number;
    readonly purgeBatchSize: number;
    readonly outboxRetentionMs: number;
    readonly inboxRetentionMs: number;
    readonly maxPurgeBatchesPerTick: number;
    readonly isStopped: () => boolean;
    readonly enter: () => () => void;
    readonly sleepWithWake: (ms: number, setWake: (fn: (() => void) | null) => void) => Promise<void>;
}
export interface HousekeepingLoop {
    executeReapOnce(): Promise<HousekeepingReapResult>;
    executePurgeOnce(): Promise<HousekeepingPurgeResult>;
    runReapLoop(): Promise<void>;
    runPurgeLoop(): Promise<void>;
    wakeAll(): void;
}
export declare function createHousekeepingLoop(config: HousekeepingLoopConfig): HousekeepingLoop;
