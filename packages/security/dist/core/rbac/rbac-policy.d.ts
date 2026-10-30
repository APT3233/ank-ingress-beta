import type { AccessPolicy, PermissionSpec } from '@ank-ingress/contracts';
export interface RbacAccessAdapter<Access> {
    roles(access: Access, scope: {
        readonly param?: string | number;
    }): readonly string[];
    writable(access: Access, scope: {
        readonly param?: string | number;
    }): boolean;
    /** Optional custom attribute check (e.g. feature entitlement or app maintenance). */
    checkAttrs?(access: Access, attrs: Readonly<Record<string, unknown>>, kind: PermissionSpec['kind']): void;
}
export declare function createRbacPolicy<Access>(adapter: RbacAccessAdapter<Access>): AccessPolicy<Access>;
