import { createRbacPolicy } from "./rbac-policy.js";
/** Grants a permission when the verified token's `roles` claim holds one of its roles; no database lookup. */
export function createClaimsPolicy() {
    return createRbacPolicy({
        roles: (identity) => identity.claims?.roles ?? [],
        writable: () => true,
    });
}
/** Authorize stage for transaction-free permission routes; the identity becomes the route's access. */
export function createClaimsAuthorizer(policy = createClaimsPolicy()) {
    return async ({ identity, permission, scopeParam }) => {
        policy.authorize(identity, permission, scopeParam === undefined ? {} : { param: scopeParam });
        return identity;
    };
}
