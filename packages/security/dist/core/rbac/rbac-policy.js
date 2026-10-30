import { AppError } from '@ank-ingress/kernel';
export function createRbacPolicy(adapter) {
    return {
        authorize(access, permission, scope) {
            if (permission === null) {
                return;
            }
            // Fail-closed if an uncataloged/unknown permission or string sentinel was passed
            if (typeof permission !== 'object' || !Array.isArray(permission.roles)) {
                throw new AppError('COMMON-403-FORBIDDEN', {
                    message: 'Unknown or invalid permission specification',
                });
            }
            if (permission.attrs && adapter.checkAttrs) {
                adapter.checkAttrs(access, permission.attrs, permission.kind);
            }
            const grantedRoles = adapter.roles(access, scope);
            let matched = false;
            for (let i = 0; i < permission.roles.length; i++) {
                if (grantedRoles.includes(permission.roles[i])) {
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                throw new AppError('COMMON-403-FORBIDDEN', {
                    message: 'Insufficient role for required permission',
                });
            }
            if (permission.kind === 'write' && !adapter.writable(access, scope)) {
                throw new AppError('COMMON-403-FORBIDDEN', {
                    message: 'Target scope is read-only',
                });
            }
        },
    };
}
