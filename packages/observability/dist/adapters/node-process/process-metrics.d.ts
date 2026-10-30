import type { MetricsRegistry } from '../../types/metrics.types.js';
export interface ProcessMetricsHandle {
    close(): void;
}
export declare function registerProcessMetrics(registry: MetricsRegistry): ProcessMetricsHandle;
