import type { WorkerTaskSpec } from '@ank-ingress/contracts';
import type { WorkerPool } from '@ank-ingress/workers';
export declare const MIN_BCRYPT_COST = 10;
export declare const MAX_PASSWORD_BYTES = 72;
export declare const bcryptWorkerTasks: readonly WorkerTaskSpec[];
export declare class PasswordHasher {
    private readonly pool;
    private readonly cost;
    constructor(pool: WorkerPool, cost?: number);
    hash(password: string, signal?: AbortSignal): Promise<string>;
    verify(password: string, hash: string | null, signal?: AbortSignal): Promise<boolean>;
    needsRehash(hash: string): boolean;
}
