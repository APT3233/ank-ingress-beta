import type { JobRecord, JobStore } from '@ank-ingress/contracts';
import type { Logger } from '@ank-ingress/observability';
export interface LeaseHeartbeatOptions {
    readonly jobStore: JobStore;
    readonly workerId: string;
    readonly logger: Logger | undefined;
    readonly job: JobRecord;
    readonly abortCtrl: AbortController;
    readonly leaseMs: number;
    readonly intervalMs: number;
}
export interface LeaseHeartbeat {
    stop(): Promise<void>;
    isLeaseLost(): boolean;
}
export declare function startLeaseHeartbeat({ jobStore, workerId, logger, job, abortCtrl, leaseMs, intervalMs }: LeaseHeartbeatOptions): LeaseHeartbeat;
