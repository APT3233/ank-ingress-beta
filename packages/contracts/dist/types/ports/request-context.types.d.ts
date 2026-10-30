import type { PermissionSpec } from '../catalog.types.js';
import type { Identity } from './identity.types.js';
export interface ContextInitializerOptions {
    readonly readOnly?: boolean;
}
export interface ContextInitializer<Tx, Access> {
    open(tx: Tx, identity: Identity, statementTimeoutMs: number, options?: ContextInitializerOptions): Promise<Access>;
    afterReadCommit?(tx: Tx, identity: Identity, access: Access, statementTimeoutMs: number): Promise<void>;
}
export interface AccessPolicy<Access> {
    authorize(access: Access, permission: PermissionSpec | null | undefined, scope: {
        readonly param?: string | number;
    }): void;
}
