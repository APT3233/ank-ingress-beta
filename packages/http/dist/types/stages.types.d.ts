import type { AnyRoute, Catalogs, IdempotencyKey, Identity, PermissionSpec, RateLimitStore, Reply } from '@ank-ingress/contracts';
export interface AuthStageInput {
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly correlationId: string;
    readonly ip: string | null;
    readonly userAgent: string | null;
    readonly signal: AbortSignal;
    readonly deferRevocationToTx?: boolean;
}
export type AuthStage = (input: AuthStageInput) => Promise<Identity>;
export interface AuthorizeStageInput {
    readonly identity: Identity;
    readonly permission: PermissionSpec;
    readonly scopeParam?: string | number;
    readonly deadlineAt: number;
    readonly signal: AbortSignal;
}
export type AuthorizeStage = (input: AuthorizeStageInput) => Promise<unknown>;
export interface ScopeStageInput {
    readonly identity: Identity;
    readonly permission: PermissionSpec | null;
    readonly scopeParam?: string | number;
    readonly idempotencyKey: IdempotencyKey | null;
    readonly readOnly: boolean;
    readonly deadlineAt: number;
    readonly signal: AbortSignal;
}
export type ScopeStage<Tx = unknown, Access = unknown> = (input: ScopeStageInput, handler: (tx: Tx, access: Access, execSignal?: AbortSignal, execDeadlineAt?: number) => Promise<Reply>) => Promise<Reply>;
export interface AuditHookInput<Tx = unknown, Access = unknown> {
    readonly route: AnyRoute;
    readonly identity: Identity;
    readonly tx: Tx | null;
    readonly access: Access | null;
    readonly params: Record<string, unknown>;
    readonly body: unknown;
    readonly reply: Reply;
}
export type AuditHook<Tx = unknown, Access = unknown> = (input: AuditHookInput<Tx, Access>) => Promise<void>;
export interface CompileDependencies {
    readonly catalogs: Catalogs;
    readonly defaultTimeoutMs: number;
    readonly defaultMaxBodyBytes: number;
    readonly authzTimeoutMs?: number;
    readonly auth?: AuthStage;
    readonly authorize?: AuthorizeStage;
    readonly scope?: ScopeStage;
    readonly onAudit?: AuditHook;
    readonly rateLimit?: RateLimitStore;
    /** Read X-Correlation-Id from requests and echo the id on responses (default true). */
    readonly correlationHeader?: boolean;
    /** Read the W3C traceparent header (default true). */
    readonly traceparent?: boolean;
}
