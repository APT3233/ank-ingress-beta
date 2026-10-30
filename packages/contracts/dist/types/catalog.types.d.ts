import type { TSchema } from '@sinclair/typebox';
export interface ErrorCodeSpec {
    readonly message: string;
}
export interface PermissionSpec {
    readonly kind: 'read' | 'write';
    readonly roles: readonly string[];
    readonly attrs?: Readonly<Record<string, unknown>>;
}
export interface EventSpec {
    readonly type: string;
    readonly version: number;
    readonly topic?: string;
    readonly schema: TSchema;
    readonly upcast?: (fromVersion: number, payload: unknown) => unknown;
}
export interface DbErrorRule {
    readonly match: {
        readonly sqlstate?: string;
        readonly constraint?: string;
    };
    readonly code: string;
    readonly retryable?: boolean;
}
export interface CatalogContribution {
    readonly errorCodes?: Readonly<Record<string, ErrorCodeSpec>>;
    readonly permissions?: Readonly<Record<string, PermissionSpec>>;
    readonly events?: readonly EventSpec[];
    readonly dbErrorRules?: readonly DbErrorRule[];
}
export interface Catalogs {
    readonly errors: {
        message(code: string): string;
        has(code: string): boolean;
        entries(): ReadonlyMap<string, ErrorCodeSpec>;
    };
    readonly permissions: {
        get(code: string): PermissionSpec | undefined;
        entries(): ReadonlyMap<string, PermissionSpec>;
    };
    readonly events: {
        spec(type: string): EventSpec | undefined;
        entries(): ReadonlyMap<string, EventSpec>;
    };
    readonly dbErrors: {
        resolve(sqlstate: string | undefined, constraint: string | undefined): DbErrorRule | undefined;
        rules(): readonly DbErrorRule[];
    };
}
