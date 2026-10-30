import { createWorkTracker } from '@ank-ingress/runtime';
import { toHeaderBlock } from "./core/headers/header-block.js";
import { compileSecurityHeaders } from "./core/headers/security-headers.js";
import { normalizeIp } from "./adapters/uws/client-ip.js";
import { compileCors } from "./adapters/uws/cors-preflight.js";
import { createUwsTransport } from "./adapters/uws/uws-transport.js";
export const HTTP_IN_FLIGHT_METRIC = 'ank_http_in_flight_work';
export function createHttpApp(options) {
    const workTracker = createWorkTracker();
    const stopCallbacks = new Set();
    const drainTimeoutCallbacks = new Set();
    const activeStreams = new Set();
    if (options.metrics?.onCollect) {
        const inFlight = options.metrics.gauge(HTTP_IN_FLIGHT_METRIC, 'Currently admitted HTTP and WebSocket work').bind();
        options.metrics.onCollect(() => inFlight.set(workTracker.count));
    }
    const maxInFlight = options.limits?.maxInFlight ?? 1024;
    const defaultTimeoutMs = options.limits?.defaultTimeoutMs ?? 15_000;
    const defaultMaxBodyBytes = options.limits?.defaultMaxBodyBytes ?? 1_048_576;
    const authzTimeoutMs = options.limits?.authzTimeoutMs ?? 2_000;
    const rawProxies = options.trustedProxies ?? options.limits?.trustedProxies ?? [];
    const trustedProxies = new Set();
    for (const p of rawProxies) {
        const norm = normalizeIp(p);
        if (norm) {
            trustedProxies.add(norm);
        }
    }
    const trustUnixSocket = options.trustUnixSocket ?? options.limits?.trustUnixSocket ?? false;
    const reqCounterMetric = options.metrics?.counter('ank_http_requests_total', 'Total HTTP requests handled', ['method', 'route', 'status']);
    const reqDuration = options.metrics?.histogram('ank_http_request_duration_seconds', 'HTTP request latency in seconds', ['method', 'route']);
    const shedCounter = options.metrics
        ?.counter('ank_http_shed_total', 'Total HTTP requests shed at admission')
        .bind();
    const securityHeaders = options.securityHeaders === undefined ? null : compileSecurityHeaders(options.securityHeaders);
    const cors = options.cors ? compileCors(options.cors) : null;
    const base = securityHeaders === null ? null : Object.freeze(Object.entries(securityHeaders).flat());
    const decor = base !== null || cors !== null ? { base, baseBlock: base === null ? null : toHeaderBlock(base), cors } : null;
    const rtState = {
        draining: false,
        trustUnixSocket,
        trustedProxies,
        maxInFlight,
        workTracker,
        activeStreams,
        logger: options.logger,
        ...(decor ? { decor } : {}),
        deps: {
            catalogs: options.catalogs,
            defaultTimeoutMs,
            defaultMaxBodyBytes,
            authzTimeoutMs,
            ...(options.auth ? { auth: options.auth } : {}),
            ...(options.authorize ? { authorize: options.authorize } : {}),
            ...(options.scope ? { scope: options.scope } : {}),
            // Erasure point: the registry stores mixed routes, so the hook is widened after `options` is checked.
            ...(options.onAudit ? { onAudit: options.onAudit } : {}),
            ...(options.rateLimit ? { rateLimit: options.rateLimit } : {}),
            ...(options.correlationHeader === false ? { correlationHeader: false } : {}),
            ...(options.traceparent === false ? { traceparent: false } : {}),
        },
        ...(reqCounterMetric
            ? {
                reqCounterMetric,
                reqCounter: (method, route, status) => {
                    reqCounterMetric.inc({ method, route, status: String(status) });
                },
            }
            : {}),
        ...(reqDuration ? { reqDuration } : {}),
        ...(shedCounter ? { shedCounter } : {}),
    };
    const transport = createUwsTransport(options.routes, rtState);
    return {
        workTracker,
        transport,
        logger: options.logger,
        trustedProxies,
        get trustUnixSocket() {
            return rtState.trustUnixSocket;
        },
        get draining() {
            return rtState.draining;
        },
        tryEnterWork() {
            if (rtState.draining || workTracker.count >= maxInFlight)
                return null;
            return workTracker.enter();
        },
        onStop(callback) {
            stopCallbacks.add(callback);
            return () => { stopCallbacks.delete(callback); };
        },
        onDrainTimeout(callback) {
            drainTimeoutCallbacks.add(callback);
            return () => { drainTimeoutCallbacks.delete(callback); };
        },
        publish(topic, message, isBinary) {
            if (!transport.listening)
                return false;
            return transport.app.publish(topic, message, isBinary ?? false);
        },
        inbound(listenConfig) {
            let handle;
            let boundPort;
            return {
                get port() {
                    return boundPort;
                },
                async start() {
                    rtState.draining = false;
                    handle = await transport.listen(listenConfig);
                    boundPort = handle.port;
                },
                pause() {
                    rtState.draining = true;
                },
                resume() {
                    rtState.draining = false;
                },
                async stop() {
                    rtState.draining = true;
                    for (const callback of stopCallbacks)
                        callback();
                    handle?.close();
                    handle = undefined;
                    for (const streamCtx of [...activeStreams]) {
                        streamCtx.abortShutdown();
                    }
                    if (workTracker.count === 0)
                        transport.deadlineWheel.close();
                },
                async drain(signal) {
                    await workTracker.idle(signal);
                    transport.deadlineWheel.close();
                    if (signal.aborted) {
                        for (const callback of drainTimeoutCallbacks)
                            callback();
                    }
                },
            };
        },
    };
}
