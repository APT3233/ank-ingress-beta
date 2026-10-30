import type { Catalogs } from '@ank-ingress/contracts';
import { AppError } from '@ank-ingress/kernel';
export interface MappedDbError {
    readonly appError: AppError;
    readonly retryable: boolean;
}
export declare function classifyDbError(err: unknown, catalogs?: Catalogs): MappedDbError;
export declare function toAppError(err: unknown, catalogs?: Catalogs): AppError;
