import { type TransferListItem } from 'node:worker_threads';
import type { WorkerPoolOptions } from '../../types/worker-pool.types.js';
export interface RunWorkerTaskOptions {
    readonly transfer?: readonly TransferListItem[];
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
}
export declare class WorkerPool {
    private readonly size;
    private readonly maxQueue;
    private readonly tasks;
    private readonly maxOldGenerationSizeMb;
    private readonly defaultTimeoutMs;
    private readonly backoffBaseMs;
    private readonly backoffCapMs;
    private readonly queueDepthGauge;
    private readonly restartsCounter;
    private readonly taskDurationHist;
    private readonly workers;
    private readonly respawnTimers;
    private readonly queue;
    private readonly drainWaiters;
    private nextTaskId;
    private consecutiveCrashes;
    private draining;
    private closed;
    constructor(options: WorkerPoolOptions);
    get activeWorkers(): number;
    get replacingWorkers(): number;
    get queueDepth(): number;
    private updateQueueGauge;
    private scheduleRespawn;
    private spawnWorker;
    private dispatch;
    private isIdle;
    private checkDrainIdle;
    run<R = unknown>(task: string, payload: unknown, options?: RunWorkerTaskOptions): Promise<R>;
    drain(signal: AbortSignal): Promise<void>;
    close(): Promise<void>;
}
