import type { AccessPolicy, Catalogs, ContextInitializer, IdempotencyKey, IdempotencyStore, Identity, PermissionSpec, Reply, TokenClaims } from '@ank-ingress/contracts';
import type { PgDatabase, Tx } from './pool.js';
export interface RequestScopeOptions<Access> {
    readonly db: Pick<PgDatabase, 'gate'>;
    readonly initializer: ContextInitializer<Tx, Access>;
    readonly policy: AccessPolicy<Access>;
    readonly idempotency?: IdempotencyStore<Tx>;
    readonly revocation?: {
        check(claims: TokenClaims, signal: AbortSignal, tx?: Tx): Promise<void>;
    };
    readonly catalogs?: Catalogs;
    readonly idempotencyGraceMs?: number;
}
export interface RunRequestScopeParams {
    readonly identity: Identity;
    readonly permission?: PermissionSpec | null;
    readonly scopeParam?: string | number;
    readonly idempotencyKey?: IdempotencyKey | null;
    readonly readOnly?: boolean;
    readonly deadlineAt: number;
    readonly signal: AbortSignal;
    readonly idempotencyGraceMs?: number;
}
export interface AuthorizeRequestScopeParams {
    readonly identity: Identity;
    readonly permission: PermissionSpec | null;
    readonly scopeParam?: string | number;
    readonly deadlineAt: number;
    readonly signal: AbortSignal;
}
export interface RequestScopeRunner<Access> {
    authorize(params: AuthorizeRequestScopeParams): Promise<Access>;
    run(params: RunRequestScopeParams, handler: (tx: Tx, access: Access, execSignal: AbortSignal, execDeadlineAt: number) => Promise<Reply>): Promise<Reply>;
}
