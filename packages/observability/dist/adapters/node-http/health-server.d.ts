import type { HealthSnapshot } from '../../types/health.types.js';
import type { MetricsRegistry } from '../../types/metrics.types.js';
export interface HealthServerOptions {
    readonly host: string;
    readonly port: number;
    readonly status: () => HealthSnapshot;
    readonly metrics: MetricsRegistry;
}
export interface HealthServer {
    readonly host: string;
    readonly port: number;
    close(): Promise<void>;
}
export declare function startHealthServer(options: HealthServerOptions): Promise<HealthServer>;
