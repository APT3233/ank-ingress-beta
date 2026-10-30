import type { Pool, PoolClient } from 'pg';
import type { MetricsRegistry } from '@ank-ingress/observability';
export interface PoolGateOptions {
    readonly maxWaiting: number;
    readonly maxConnections?: number;
    readonly metrics?: MetricsRegistry;
    readonly poolName?: string;
}
export interface PoolGate {
    acquire(signal?: AbortSignal): Promise<PoolClient>;
    readonly waiting: number;
}
export declare function createPoolGate(pool: Pick<Pool, 'connect'>, options: PoolGateOptions): PoolGate;
