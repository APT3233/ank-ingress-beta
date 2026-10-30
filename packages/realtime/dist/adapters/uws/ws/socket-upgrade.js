import { resolveClientIp } from '@ank-ingress/http';
import { AppError, isAppError, newUuid } from '@ank-ingress/kernel';
export function createUpgradeHandler(httpApp, deps, pendingUpgrades) {
    return (res, req, context) => {
        const done = httpApp.tryEnterWork();
        if (!done) {
            res.cork(() => { res.writeStatus('503 Service Unavailable').end(); });
            return;
        }
        let aborted = false;
        const ac = new AbortController();
        res.onAborted(() => {
            aborted = true;
            ac.abort();
        });
        const cancelUpgrade = () => {
            ac.abort(new Error('Server shutting down'));
            if (aborted)
                return;
            aborted = true;
            res.cork(() => { res.writeStatus('503 Service Unavailable').end(); });
        };
        pendingUpgrades.add(cancelUpgrade);
        // Synchronously snapshot upgrade headers, peer address, and request fields before async auth
        const remoteAb = typeof res.getRemoteAddressAsText === 'function' ? res.getRemoteAddressAsText() : undefined;
        const remoteAddress = remoteAb && remoteAb.byteLength > 0 ? Buffer.from(remoteAb).toString('utf8') : '';
        const secWebSocketKey = req.getHeader('sec-websocket-key');
        const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
        const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');
        const headers = {
            authorization: req.getHeader('authorization') || undefined,
            'x-tenant-id': req.getHeader('x-tenant-id') || undefined,
            'x-correlation-id': req.getHeader('x-correlation-id') || undefined,
            'x-forwarded-for': req.getHeader('x-forwarded-for') || undefined,
            'user-agent': req.getHeader('user-agent') || undefined,
        };
        const rawCorr = headers['x-correlation-id'];
        const correlationId = rawCorr && rawCorr.length <= 64 ? rawCorr : newUuid();
        const clientIp = resolveClientIp(remoteAddress, headers['x-forwarded-for'], httpApp.trustedProxies ?? new Set(), httpApp.trustUnixSocket ?? false);
        void (async () => {
            try {
                const identity = await deps.auth({
                    headers,
                    correlationId,
                    ip: clientIp,
                    userAgent: headers['user-agent'] ?? null,
                    signal: ac.signal,
                });
                if (aborted)
                    return;
                if (httpApp.draining) {
                    cancelUpgrade();
                    return;
                }
                if (identity.claims?.tid === null && identity.tenantId !== null) {
                    if (!deps.authorizeTenant) {
                        throw new AppError('COMMON-403-FORBIDDEN', {
                            message: 'Tenant membership must be authorized before WebSocket upgrade',
                        });
                    }
                    await deps.authorizeTenant(identity, ac.signal);
                    if (aborted)
                        return;
                    if (httpApp.draining) {
                        cancelUpgrade();
                        return;
                    }
                }
                res.cork(() => {
                    res.upgrade({
                        identity,
                        client: null,
                        closed: false,
                        backpressured: false,
                        inFlightMessages: 0,
                        pendingHooks: 0,
                        messageQueue: [],
                    }, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context);
                });
            }
            catch (err) {
                if (aborted)
                    return;
                const status = isAppError(err) ? err.httpStatus : 401;
                const code = isAppError(err) ? err.code : 'COMMON-401-UNAUTHENTICATED';
                const statusText = status === 403 ? '403 Forbidden' : '401 Unauthorized';
                const body = JSON.stringify({ code, message: 'WebSocket upgrade rejected', correlationId });
                res.cork(() => {
                    res
                        .writeStatus(statusText)
                        .writeHeader('content-type', 'application/json; charset=utf-8')
                        .end(body);
                });
            }
            finally {
                pendingUpgrades.delete(cancelUpgrade);
                done();
            }
        })();
    };
}
