import type { Catalogs } from '@ank-ingress/contracts';
/** PostgreSQL transient SQLSTATE classes; the default for the consumer runner. */
export declare function isPostgresTransientSqlState(code: string): boolean;
export declare function classifyExecutionError(err: unknown, catalogs: Catalogs, isTransientCode?: (code: string) => boolean): {
    readonly category: 'TRANSIENT' | 'PERMANENT' | 'UNKNOWN';
    readonly errorCode: string;
    readonly errorMessage: string;
};
