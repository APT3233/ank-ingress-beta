import { AppError } from '@ank-ingress/kernel';
import { toReply } from "../../../core/errors/error-boundary.js";
import { STATE_OPEN } from "../request-state.js";
import { sendJson } from "../send/send-json.js";
import { sendReply } from "../send/send-reply.js";
const PREBOUND_STATUS_CODES = [
    200, 201, 202, 204, 400, 401, 403, 404, 405, 409, 413, 415, 422, 423, 429, 500, 503,
];
export function createRouteHandlerEnv(compiled, rt, isHead) {
    const { paramNames, headerNames, serializeResponse } = compiled;
    const paramLen = paramNames.length;
    const headerLen = headerNames.length;
    const operationName = `${compiled.method} ${compiled.path}`;
    const needUrlSnapshot = paramLen > 0 || compiled.needsIdempotencyHash;
    const publicNoBody = !compiled.needsAuth && compiled.tx === 'none' && compiled.spec.access.kind === 'public' &&
        compiled.spec.body === undefined && !compiled.spec.audit && compiled.spec.rateLimit === undefined &&
        compiled.bodyFormat !== 'multipart';
    const readCorrelation = rt.deps.correlationHeader !== false;
    const readTraceparent = rt.deps.traceparent !== false;
    // The two-header shortcut applies only when both are read for request context, not merely captured.
    const hasDefaultHeadersOnly = readCorrelation && readTraceparent &&
        headerLen === 2 && headerNames[0] === 'x-correlation-id' && headerNames[1] === 'traceparent';
    const capturesNoHeaders = headerLen === 0;
    const capturesForwardedFor = headerNames.includes('x-forwarded-for');
    const proxiesTrusted = rt.trustedProxies.size > 0;
    const etag = compiled.spec.etag === true;
    const validatesBeforeHandler = paramLen > 0 || compiled.needsQuery;
    const multipartLimits = compiled.bodyFormat === 'multipart'
        ? {
            maxParts: compiled.spec.multipart?.maxParts ?? 100,
            maxFieldBytes: compiled.spec.multipart?.maxFieldBytes ?? 65_536,
            maxHeaderBytes: compiled.spec.multipart?.maxHeaderBytes ?? 8_192,
        }
        : null;
    const rateLimit = compiled.spec.rateLimit;
    const rateLimitBucket = rateLimit?.bucket ?? operationName;
    const rateLimitByIdentity = rateLimit?.key === 'identity';
    const rateLimitByIp = rateLimit !== undefined && !rateLimitByIdentity;
    const enforceRateLimit = async (subject) => {
        const decision = await rt.deps.rateLimit.consume({
            bucket: rateLimitBucket,
            subject,
            limit: rateLimit.limit,
            windowMs: rateLimit.windowMs,
        });
        if (!decision.allowed) {
            throw new AppError('COMMON-429-RATE_LIMITED', {
                message: 'Rate limit exceeded',
                params: { retryAfterSeconds: Math.max(1, Math.ceil(decision.retryAfterMs / 1000)) },
            });
        }
    };
    const decor = rt.decor ?? null;
    const decorEveryResponse = decor !== null && decor.base !== null;
    const cors = decor?.cors ?? null;
    // Pre-bind metric series at route compile time
    const boundDuration = rt.reqDuration?.bind({
        method: compiled.method,
        route: compiled.path,
    });
    const statusSeries = new Map();
    if (rt.reqCounterMetric) {
        for (let i = 0; i < PREBOUND_STATUS_CODES.length; i++) {
            const code = PREBOUND_STATUS_CODES[i];
            statusSeries.set(code, rt.reqCounterMetric.bind({
                method: compiled.method,
                route: compiled.path,
                status: String(code),
            }));
        }
    }
    const boundStatus200 = statusSeries.get(200);
    const routeDeadlineLane = rt.deadlineWheel?.getLane(compiled.timeoutMs) ?? null;
    const fallbackPublicDeadlines = rt.deadlineWheel ? null : new WeakMap();
    const recordStatus = (status) => {
        if (status === 200 && boundStatus200 !== undefined) {
            boundStatus200.inc();
            return;
        }
        if (rt.reqCounterMetric) {
            let bound = statusSeries.get(status);
            if (!bound) {
                bound = rt.reqCounterMetric.bind({
                    method: compiled.method,
                    route: compiled.path,
                    status: String(status),
                });
                statusSeries.set(status, bound);
            }
            bound.inc();
        }
        else {
            rt.reqCounter?.(compiled.method, compiled.path, status);
        }
    };
    // Route-level deadline expire handler (0 per-request closure allocation)
    const onRouteDeadlineExpire = (ctx) => {
        if (ctx.writable) {
            const closeConn = !ctx.bodyComplete;
            const sentStatus = sendJson(ctx.res, ctx, 503, {
                code: 'COMMON-503-UNAVAILABLE',
                message: 'Request deadline exceeded',
                correlationId: ctx.correlationId,
            }, closeConn ? { 'retry-after': '1', connection: 'close' } : { 'retry-after': '1' }, isHead, closeConn, rt.logger, null);
            recordStatus(sentStatus);
        }
        ctx.abortDeadline();
    };
    const requestCancelled = (ctx) => {
        if (ctx.writable && !ctx.aborted && Date.now() >= ctx.deadlineAt)
            onRouteDeadlineExpire(ctx);
        return ctx.state !== STATE_OPEN || ctx.aborted;
    };
    const clearPublicDeadline = (ctx) => {
        ctx.unlinkDeadline();
        const timer = fallbackPublicDeadlines?.get(ctx);
        if (timer !== undefined) {
            clearTimeout(timer);
            fallbackPublicDeadlines.delete(ctx);
        }
    };
    /** `endTime` (a `performance.now()` reading) lets the caller reuse a clock read it already made. */
    const finishRouteRequest = (ctx, endTime) => {
        if (ctx.workDone)
            return;
        ctx.workDone = true;
        clearPublicDeadline(ctx);
        if (boundDuration !== undefined) {
            boundDuration.observe(((endTime ?? performance.now()) - ctx.startTime) / 1000);
        }
        rt.workTracker.dec();
    };
    const handleRouteFailure = (ctx, err, bodyCollector) => {
        bodyCollector?.cancel();
        if (ctx.writable) {
            const errReply = toReply(err, rt.deps.catalogs, ctx.correlationId, rt.logger);
            const closeConn = !ctx.bodyComplete || errReply.status === 413;
            const sent = sendReply(ctx.res, ctx, errReply, isHead, closeConn, rt.logger, null);
            if (typeof sent === 'number') {
                recordStatus(sent);
                finishRouteRequest(ctx);
            }
            else {
                sent.then((st) => {
                    recordStatus(st);
                    finishRouteRequest(ctx);
                }, () => finishRouteRequest(ctx));
            }
        }
        else {
            finishRouteRequest(ctx);
        }
    };
    return {
        compiled,
        rt,
        isHead,
        paramNames,
        headerNames,
        serializeResponse,
        paramLen,
        headerLen,
        operationName,
        needUrlSnapshot,
        publicNoBody,
        readCorrelation,
        readTraceparent,
        hasDefaultHeadersOnly,
        capturesNoHeaders,
        capturesForwardedFor,
        proxiesTrusted,
        etag,
        validatesBeforeHandler,
        multipartLimits,
        rateLimit,
        rateLimitBucket,
        rateLimitByIdentity,
        rateLimitByIp,
        enforceRateLimit,
        decor,
        decorEveryResponse,
        cors,
        boundDuration,
        statusSeries,
        boundStatus200,
        routeDeadlineLane,
        fallbackPublicDeadlines,
        recordStatus,
        onRouteDeadlineExpire,
        requestCancelled,
        clearPublicDeadline,
        finishRouteRequest,
        handleRouteFailure,
    };
}
