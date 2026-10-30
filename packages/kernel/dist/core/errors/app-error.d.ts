import type { AppErrorOptions, ErrorCategory, ErrorDetail, ErrorParams } from '../../types/error.types.js';
export declare class AppError extends Error {
    readonly code: string;
    readonly httpStatus: number;
    readonly category: ErrorCategory;
    readonly details: readonly ErrorDetail[];
    readonly params: ErrorParams;
    constructor(code: string, options?: AppErrorOptions);
}
export declare function isAppError(value: unknown): value is AppError;
export declare function validationError(details: readonly ErrorDetail[], message?: string): AppError;
