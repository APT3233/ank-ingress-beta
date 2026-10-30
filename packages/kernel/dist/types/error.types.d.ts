export type ErrorCategory = 'VALIDATION' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'PAYLOAD' | 'LOCKED' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'INTERNAL';
export type ErrorParams = Readonly<Record<string, string | number>>;
export interface ErrorDetail {
    readonly field?: string;
    readonly code: string;
    readonly params?: ErrorParams;
}
export interface AppErrorOptions {
    readonly message?: string;
    readonly details?: readonly ErrorDetail[];
    readonly params?: ErrorParams;
    readonly cause?: unknown;
}
