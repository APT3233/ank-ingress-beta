import type { AccessPolicy, Identity, PermissionSpec } from '@ank-ingress/contracts';
export interface ClaimsAuthorizeInput {
    readonly identity: Identity;
    readonly permission: PermissionSpec;
    readonly scopeParam?: string | number;
    readonly deadlineAt: number;
    readonly signal: AbortSignal;
}
/** Grants a permission when the verified token's `roles` claim holds one of its roles; no database lookup. */
export declare function createClaimsPolicy(): AccessPolicy<Identity>;
/** Authorize stage for transaction-free permission routes; the identity becomes the route's access. */
export declare function createClaimsAuthorizer(policy?: AccessPolicy<Identity>): (input: ClaimsAuthorizeInput) => Promise<Identity>;
