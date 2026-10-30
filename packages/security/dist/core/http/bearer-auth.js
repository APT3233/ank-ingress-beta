import { AppError, parseIntId } from '@ank-ingress/kernel';
export function bearerAuth(options) {
    return async (input) => {
        const authHeader = input.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('COMMON-401-UNAUTHENTICATED', {
                message: 'Missing or malformed Authorization Bearer header',
            });
        }
        const token = authHeader.slice(7).trim();
        if (!token) {
            throw new AppError('COMMON-401-UNAUTHENTICATED', {
                message: 'Empty Bearer token',
            });
        }
        const claims = options.verifier.verify(token);
        let revocationDeferred = false;
        if (input.deferRevocationToTx && options.revocation.checkCached) {
            const hit = options.revocation.checkCached(claims);
            if (!hit) {
                revocationDeferred = true;
            }
        }
        else {
            await options.revocation.check(claims, input.signal);
        }
        let tenantId = claims.tid;
        const headerTenant = input.headers['x-tenant-id'];
        if (headerTenant !== undefined && headerTenant !== '') {
            const parsedTenant = parseIntId(headerTenant, 'X-Tenant-Id');
            if (claims.tid !== null && claims.tid !== parsedTenant) {
                throw new AppError('COMMON-403-FORBIDDEN', {
                    message: 'X-Tenant-Id does not match token tenant claim',
                });
            }
            tenantId = parsedTenant;
        }
        return {
            accountId: claims.sub,
            tenantId,
            sessionId: claims.sid,
            tokenId: claims.jti,
            correlationId: input.correlationId,
            ip: input.ip,
            userAgent: input.userAgent,
            claims,
            ...(revocationDeferred ? { revocationDeferred: true } : {}),
        };
    };
}
