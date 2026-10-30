import { AppError } from '@ank-ingress/kernel';
export function assertNotRevoked(claims, state) {
    if (state.accountDisabled) {
        throw new AppError('AUTH-403-ACCOUNT_DISABLED', {
            message: 'Account has been disabled',
        });
    }
    if (state.tokenRevoked || state.sessionRevoked) {
        throw new AppError('AUTH-401-SESSION_EXPIRED', {
            message: 'Token or session has been revoked',
        });
    }
    if (state.tokensValidAfterSec !== null && claims.iat < state.tokensValidAfterSec) {
        throw new AppError('AUTH-401-SESSION_EXPIRED', {
            message: 'Token was issued before security credential rotation',
        });
    }
}
