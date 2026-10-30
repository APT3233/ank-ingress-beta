import type { JobRecord } from '../job-spec.types.js';
export interface JobFinishOptions {
    readonly worker?: string;
    readonly leaseGeneration?: number;
    readonly errorDetail?: string;
}
export interface JobStore {
    claim(worker: string, types: readonly string[], limit: number, leaseMs: number): Promise<JobRecord[]>;
    heartbeat?(id: string, worker: string, leaseMs: number, leaseGeneration?: number, progress?: number): Promise<boolean>;
    complete(id: string, result: unknown, options?: JobFinishOptions): Promise<boolean>;
    fail(id: string, code: string, retryAt: Date | null, options?: JobFinishOptions): Promise<boolean>;
    release?(worker: string, jobIds?: readonly string[], leaseGeneration?: number): Promise<number>;
}
export interface WorkerTaskSpec {
    readonly name: string;
    readonly moduleUrl: string;
}
