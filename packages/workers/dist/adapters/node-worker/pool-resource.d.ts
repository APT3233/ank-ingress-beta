import type { Inbound, Resource } from '@ank-ingress/runtime';
import type { WorkerPool } from './worker-pool.js';
export declare function workerPoolResource(pool: WorkerPool, name?: string): Resource & Pick<Inbound, 'drain'>;
