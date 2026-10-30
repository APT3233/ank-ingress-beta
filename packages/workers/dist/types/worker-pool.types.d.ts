import type { WorkerTaskSpec } from '@ank-ingress/contracts';
import type { MetricsRegistry } from '@ank-ingress/observability';
export interface WorkerPoolOptions {
    readonly size: number;
    readonly maxQueue: number;
    readonly tasks: readonly WorkerTaskSpec[];
    readonly maxOldGenerationSizeMb?: number;
    readonly defaultTimeoutMs?: number;
    readonly respawnBackoff?: {
        readonly baseMs?: number;
        readonly capMs?: number;
    };
    readonly metrics?: MetricsRegistry;
}
