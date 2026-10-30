import { AsyncLocalStorage } from 'node:async_hooks';
export interface LogScope {
    readonly correlationId?: string;
    readonly traceId?: string;
    readonly spanId?: string;
    readonly traceparent?: string;
    readonly tenantId?: number | null;
    readonly accountId?: string | null;
    readonly operation?: string;
}
export declare const requestScope: AsyncLocalStorage<LogScope>;
export declare function enterSyncScope(scope: LogScope): LogScope | undefined;
export declare function exitSyncScope(prev: LogScope | undefined): void;
export declare function runWithSyncScope<T>(scope: LogScope, fn: () => T): T;
export declare function runInScope<T>(scope: LogScope, fn: () => T): T;
export declare function currentScope(): LogScope | undefined;
