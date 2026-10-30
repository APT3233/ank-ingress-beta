import { startBodyCollector } from "../body-collector.js";
import { isSafeCorrelationId, nextFastUuid } from "../correlation-id.js";
import { startMultipartReader } from "../multipart-reader.js";
import { RequestCtx } from "../request-ctx.js";
import { EMPTY_HEADER_MAP } from "../request-state.js";
import { startRouteExecution } from "./execute.js";
import { runPublicRoute } from "./public-fast-path.js";
import { createRouteHandlerEnv } from "./route-env.js";
const OVERLOAD_BODY = '{"code":"COMMON-503-UNAVAILABLE","message":"Server overloaded or draining","correlationId":""}';
const OVERLOAD_BODY_LEN = String(Buffer.byteLength(OVERLOAD_BODY));
const BASE_EPOCH_MS = Date.now();
const BASE_PERF_MS = performance.now();
/** Shed answer; its cork closure is allocated only on the shed path, never on admitted requests. */
function writeOverload(res, isHead) {
    res.cork(() => {
        res
            .writeStatus('503 Service Unavailable')
            .writeHeader('content-type', 'application/json; charset=utf-8')
            .writeHeader('retry-after', '1');
        if (isHead) {
            res.writeHeader('content-length', OVERLOAD_BODY_LEN).endWithoutBody();
        }
        else {
            res.end(OVERLOAD_BODY);
        }
    });
}
export function createUwsRouteHandler(compiled, rt, isHead = false) {
    // Built once per route; the per-request function and the extracted stages share it.
    const env = createRouteHandlerEnv(compiled, rt, isHead);
    const { paramNames, headerNames, paramLen, headerLen, operationName, needUrlSnapshot, publicNoBody } = env;
    const { readCorrelation, readTraceparent, hasDefaultHeadersOnly, capturesNoHeaders, capturesForwardedFor } = env;
    const { proxiesTrusted, multipartLimits, decor, decorEveryResponse, cors } = env;
    return (res, req) => {
        // 1. Admission check at very first line before any allocation
        if (rt.draining || rt.workTracker.count >= rt.maxInFlight) {
            rt.shedCounter?.inc();
            writeOverload(res, isHead);
            return;
        }
        const startTime = performance.now();
        const nowMs = Math.trunc(BASE_EPOCH_MS + (startTime - BASE_PERF_MS));
        const deadlineAt = nowMs + compiled.timeoutMs;
        // 2. Attach onAborted and snapshot peer remoteAddress (only when needed for auth/XFF)
        const ctx = new RequestCtx(res, compiled.method, compiled.path, deadlineAt, compiled.needsAuth, startTime, operationName, !publicNoBody);
        // 3. Synchronously snapshot uWS request fields before any async step
        if (needUrlSnapshot && typeof req.getUrl === 'function') {
            ctx.url = req.getUrl() || compiled.path;
        }
        if (paramLen > 0) {
            const p = {};
            for (let i = 0; i < paramLen; i++) {
                p[paramNames[i]] = req.getParameter(i) ?? '';
            }
            ctx.params = p;
        }
        if (capturesNoHeaders) {
            // Both request-context headers disabled and nothing else to capture: no getHeader calls.
            ctx.correlationId = nextFastUuid();
        }
        else if (hasDefaultHeadersOnly) {
            const rawCorr = req.getHeader('x-correlation-id');
            const rawTp = req.getHeader('traceparent');
            ctx.correlationId = rawCorr !== '' && isSafeCorrelationId(rawCorr) ? rawCorr : nextFastUuid();
            if (rawTp !== '') {
                ctx.rawTraceparent = rawTp;
            }
            if (rawCorr !== '' || rawTp !== '') {
                const h = {};
                if (rawCorr !== '')
                    h['x-correlation-id'] = rawCorr;
                if (rawTp !== '')
                    h.traceparent = rawTp;
                ctx.headers = h;
            }
        }
        else {
            let h = null;
            for (let i = 0; i < headerLen; i++) {
                const name = headerNames[i];
                const val = req.getHeader(name);
                if (val !== '') {
                    if (h === null)
                        h = {};
                    h[name] = val;
                }
            }
            if (h !== null) {
                ctx.headers = h;
            }
            const rawCorr = readCorrelation ? ctx.headers['x-correlation-id'] : undefined;
            ctx.correlationId = rawCorr && isSafeCorrelationId(rawCorr) ? rawCorr : nextFastUuid();
            // '' (not undefined) makes the span ignore a traceparent the route captured as a plain header.
            ctx.rawTraceparent = readTraceparent ? ctx.headers.traceparent : '';
        }
        if (readCorrelation)
            ctx.correlationHeader = ctx.correlationId;
        // Opt-in features: nothing below runs unless trusted proxies, security headers, or CORS are configured.
        if (proxiesTrusted || rt.trustUnixSocket) {
            ctx.ipTrust = rt;
            if (!capturesForwardedFor) {
                const xff = req.getHeader('x-forwarded-for');
                if (xff !== '') {
                    if (ctx.headers === EMPTY_HEADER_MAP)
                        ctx.headers = { 'x-forwarded-for': xff };
                    else
                        ctx.headers['x-forwarded-for'] = xff;
                }
            }
        }
        if (decor !== null) {
            if (decorEveryResponse)
                ctx.decor = decor;
            if (cors !== null) {
                const origin = req.getHeader('origin');
                const allowed = origin === '' ? null : cors.allowOrigin(origin);
                if (allowed !== null) {
                    ctx.corsOrigin = allowed;
                    ctx.decor = decor;
                }
            }
        }
        if (compiled.needsQuery || compiled.needsIdempotencyHash) {
            ctx.queryRaw = req.getQuery() ?? '';
        }
        // 4. Synchronously register body callback before any await (bounded buffer, no Content-Length prealloc)
        let bodyCollector = null;
        let multipart = null;
        if (multipartLimits !== null) {
            multipart = startMultipartReader(res, ctx, compiled.maxBodyBytes, multipartLimits);
        }
        else if (compiled.needsBody && compiled.spec.body !== undefined) {
            bodyCollector = startBodyCollector(res, ctx, compiled.maxBodyBytes);
        }
        // 5. Enter WorkTracker (0 closure allocation)
        rt.workTracker.inc();
        if (publicNoBody) {
            runPublicRoute(env, ctx);
            return;
        }
        startRouteExecution(env, res, ctx, bodyCollector, multipart);
    };
}
