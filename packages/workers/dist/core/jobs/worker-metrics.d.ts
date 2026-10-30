import type { MetricsRegistry } from '@ank-ingress/observability';
export interface WorkerMetricsHandles {
    readonly jobsCompleted: ReturnType<MetricsRegistry['counter']>;
    readonly jobsReaped: ReturnType<MetricsRegistry['counter']>;
    readonly eventsPurged: ReturnType<MetricsRegistry['counter']>;
}
export declare const workerMetricsCache: WeakMap<MetricsRegistry, WorkerMetricsHandles>;
export declare function getWorkerMetrics(metrics: MetricsRegistry | undefined): WorkerMetricsHandles | null;
