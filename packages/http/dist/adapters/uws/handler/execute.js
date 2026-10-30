import { Reply } from '@ank-ingress/contracts';
import { AppError } from '@ank-ingress/kernel';
import { runInScope } from '@ank-ingress/observability';
import { checkIdempotencyHeader, computeIdempotencyRequestHash } from "../../../core/compile/idempotency.js";
import { EMPTY_HEADER_MAP, EMPTY_STRING_MAP } from "../request-state.js";
import { RequestLogScope, RouteRequest, RouteScope } from "../route-request.js";
import { sendEmpty, sendText } from "../send/send-basic.js";
import { sendJsonWithEtag, sendTextWithEtag } from "../send/send-etag.js";
import { sendJson } from "../send/send-json.js";
import { sendStream } from "../send/send-stream.js";
/** Non-public routes: schedules the deadline, then runs auth, rate limit, body, scope and reply in the request log scope. */
export function startRouteExecution(env, res, ctx, bodyCollector, multipart) {
    const rt = env.rt;
    let fallbackTimer = null;
    // 6. Schedule deadline in O(1) via 25ms DeadlineWheel
    if (rt.deadlineWheel && env.routeDeadlineLane !== null) {
        rt.deadlineWheel.scheduleLane(ctx, env.routeDeadlineLane, env.onRouteDeadlineExpire);
    }
    else if (rt.deadlineWheel) {
        rt.deadlineWheel.schedule(ctx, env.compiled.timeoutMs, env.onRouteDeadlineExpire);
    }
    else {
        fallbackTimer = setTimeout(() => env.onRouteDeadlineExpire(ctx), env.compiled.timeoutMs);
    }
    // Closures read route values through `env` so each captures only `env` and per-request values.
    runInScope(new RequestLogScope(ctx, env.operationName), () => {
        executeRoute(env, res, ctx, bodyCollector, multipart, fallbackTimer).catch((fatalErr) => {
            env.rt.logger.error('http.unhandled_pipeline_error', {
                method: env.compiled.method,
                path: env.compiled.path,
                correlationId: ctx.correlationId,
                error: fatalErr instanceof Error ? fatalErr.message : String(fatalErr),
            });
        });
    });
}
async function executeRoute(env, res, ctx, bodyCollector, multipart, fallbackTimer) {
    const { compiled, rt, isHead, etag, serializeResponse, rateLimitByIp, rateLimitByIdentity, enforceRateLimit } = env;
    const { requestCancelled, recordStatus, finishRouteRequest, handleRouteFailure } = env;
    // Cleared once `sendStream` owns the body; until then a failure must close a stream reply here.
    let unsentReply = null;
    try {
        // Per-IP limits run before authentication so rejected requests cost no auth or body work.
        if (rateLimitByIp) {
            await enforceRateLimit(ctx.ip ?? 'unknown');
            if (requestCancelled(ctx)) {
                bodyCollector?.cancel();
                return;
            }
        }
        // 7. Authenticate immediately after header snapshot BEFORE parsing/hashing/validating body
        let identity = null;
        if (compiled.needsAuth) {
            if (!rt.deps.auth) {
                throw new AppError('COMMON-401-UNAUTHENTICATED', { message: 'Authentication stage not configured' });
            }
            const clientIp = ctx.ip;
            const authInput = {
                headers: ctx.headers === EMPTY_HEADER_MAP ? {} : ctx.headers,
                correlationId: ctx.correlationId,
                ip: clientIp,
                userAgent: ctx.headers['user-agent'] ?? null,
                get signal() {
                    return ctx.signal;
                },
                deferRevocationToTx: compiled.tx !== 'none' && !compiled.needsBody && Boolean(rt.deps.scope),
            };
            identity = await rt.deps.auth(authInput);
            if (requestCancelled(ctx)) {
                bodyCollector?.cancel();
                return;
            }
            if (rateLimitByIdentity) {
                await enforceRateLimit(`${identity.tenantId ?? ''}:${identity.accountId}`);
                if (requestCancelled(ctx)) {
                    bodyCollector?.cancel();
                    return;
                }
            }
        }
        const idemKeyStr = checkIdempotencyHeader(compiled.spec.idempotent, ctx.headers['idempotency-key']);
        ctx.idempotencyKey = idemKeyStr;
        // 8. Parse, hash, and validate body only AFTER auth succeeded
        let rawBody = undefined;
        let rawBodyBuffer = Buffer.alloc(0);
        if (bodyCollector) {
            const parsed = await bodyCollector.read(compiled.bodyFormat, ctx.headers['content-type'], ctx.headers['content-length'], false);
            if (requestCancelled(ctx)) {
                return;
            }
            rawBody = parsed.data;
            rawBodyBuffer = parsed.rawBuffer;
        }
        const params = compiled.validateParams(ctx.params);
        const query = compiled.needsQuery
            ? compiled.validateQuery(ctx.queryRaw)
            : EMPTY_STRING_MAP;
        const body = compiled.spec.body !== undefined ? compiled.validateBody(rawBody) : undefined;
        if (requestCancelled(ctx)) {
            return;
        }
        const routeReq = new RouteRequest(ctx, params, query, body, identity, undefined, undefined, multipart);
        const scopeParamName = compiled.spec.access.kind === 'permission' ? compiled.spec.access.scopeParam : undefined;
        const scopeParamVal = scopeParamName
            ? (params[scopeParamName]
                ?? body?.[scopeParamName]
                ?? query[scopeParamName])
            : undefined;
        let reply;
        if (compiled.tx !== 'none') {
            if (!rt.deps.scope || !identity) {
                throw new AppError('COMMON-403-FORBIDDEN', {
                    message: 'Transaction scope stage or identity missing',
                });
            }
            if (compiled.spec.access.kind === 'permission' && !compiled.permissionSpec) {
                throw new AppError('COMMON-403-FORBIDDEN', {
                    message: `Unknown permission "${compiled.spec.access.code}"`,
                });
            }
            const concretePath = ctx.url || compiled.path;
            const idempotencyKeyObj = idemKeyStr
                ? {
                    tenantId: identity.tenantId,
                    accountId: identity.accountId,
                    operation: `${compiled.method} ${concretePath}`,
                    key: idemKeyStr,
                    requestHash: computeIdempotencyRequestHash(compiled.method, concretePath, ctx.queryRaw, rawBodyBuffer),
                }
                : null;
            const scopeInput = {
                identity,
                permission: compiled.permissionSpec,
                ...(scopeParamVal === undefined ? {} : { scopeParam: scopeParamVal }),
                idempotencyKey: idempotencyKeyObj,
                readOnly: compiled.tx === 'read',
                deadlineAt: ctx.deadlineAt,
                get signal() {
                    return ctx.signal;
                },
            };
            reply = await rt.deps.scope(scopeInput, async (tx, access, execSignal, execDeadlineAt) => {
                if (requestCancelled(ctx)) {
                    throw new AppError('COMMON-503-UNAVAILABLE', {
                        message: 'Request cancelled before handler execution',
                    });
                }
                const scopedReq = execSignal !== undefined || execDeadlineAt !== undefined
                    ? new RouteRequest(ctx, params, query, body, identity, execSignal, execDeadlineAt, multipart)
                    : routeReq;
                const scopedScope = new RouteScope(ctx, tx, access, execSignal, execDeadlineAt);
                const out = await compiled.spec.handle(scopedReq, scopedScope);
                unsentReply = out;
                if (compiled.spec.audit && rt.deps.onAudit) {
                    await rt.deps.onAudit({
                        route: compiled.spec,
                        identity,
                        tx,
                        access,
                        params,
                        body,
                        reply: out,
                    });
                }
                return out;
            });
        }
        else {
            if (compiled.spec.access.kind === 'authenticated' &&
                identity?.claims?.tid === null &&
                identity.tenantId !== null) {
                throw new AppError('COMMON-403-FORBIDDEN', {
                    message: 'Tenant membership must be authorized before a transaction-free authenticated route',
                });
            }
            let access = null;
            if (compiled.spec.access.kind === 'permission') {
                if (!compiled.permissionSpec || !identity) {
                    throw new AppError('COMMON-403-FORBIDDEN', {
                        message: `Unknown permission "${compiled.spec.access.code}"`,
                    });
                }
                const authzTimeoutMs = Math.min(compiled.timeoutMs, rt.deps.authzTimeoutMs ?? 2_000);
                const authzDeadlineAt = Math.min(ctx.deadlineAt, Date.now() + authzTimeoutMs);
                const authzAbort = new AbortController();
                ctx.onAbort(() => {
                    if (!authzAbort.signal.aborted) {
                        authzAbort.abort(new Error('Request aborted'));
                    }
                });
                const authzTimer = setTimeout(() => {
                    if (!authzAbort.signal.aborted) {
                        authzAbort.abort(new AppError('COMMON-503-UNAVAILABLE', {
                            message: 'Authorization deadline exceeded',
                        }));
                    }
                }, Math.max(1, authzDeadlineAt - Date.now()));
                try {
                    if (rt.deps.authorize) {
                        access = await rt.deps.authorize({
                            identity,
                            permission: compiled.permissionSpec,
                            ...(scopeParamVal === undefined ? {} : { scopeParam: scopeParamVal }),
                            deadlineAt: authzDeadlineAt,
                            signal: authzAbort.signal,
                        });
                    }
                    else if (rt.deps.scope) {
                        await rt.deps.scope({
                            identity,
                            permission: compiled.permissionSpec,
                            ...(scopeParamVal === undefined ? {} : { scopeParam: scopeParamVal }),
                            idempotencyKey: null,
                            readOnly: true,
                            deadlineAt: authzDeadlineAt,
                            signal: authzAbort.signal,
                        }, async (_tx, resolvedAccess) => {
                            access = resolvedAccess;
                            return Reply.empty(204);
                        });
                    }
                    else {
                        throw new AppError('COMMON-403-FORBIDDEN', {
                            message: 'Authorization stage not configured',
                        });
                    }
                }
                finally {
                    clearTimeout(authzTimer);
                }
                if (requestCancelled(ctx)) {
                    return;
                }
            }
            const routeScope = new RouteScope(ctx, null, access);
            reply = await compiled.spec.handle(routeReq, routeScope);
            unsentReply = reply;
            if (compiled.spec.audit && rt.deps.onAudit && identity) {
                await rt.deps.onAudit({
                    route: compiled.spec,
                    identity,
                    tx: null,
                    access,
                    params,
                    body,
                    reply,
                });
            }
        }
        requestCancelled(ctx);
        // A reply before the multipart body was fully read stops reading and closes the connection after it.
        let closeAfterReply = false;
        if (multipart !== null && !multipart.finished) {
            multipart.cancel();
            closeAfterReply = !ctx.bodyComplete;
        }
        if (ctx.writable) {
            if (reply.kind === 'stream') {
                ctx.unlinkDeadline();
                if (fallbackTimer !== null) {
                    clearTimeout(fallbackTimer);
                    fallbackTimer = null;
                }
                rt.activeStreams?.add(ctx);
                unsentReply = null;
                try {
                    await sendStream(res, ctx, reply, isHead);
                    recordStatus(reply.status ?? 200);
                }
                finally {
                    rt.activeStreams?.delete(ctx);
                }
            }
            else if (reply.kind === 'json') {
                const sentStatus = etag
                    ? sendJsonWithEtag(res, ctx, reply, isHead, rt.logger, serializeResponse)
                    : sendJson(res, ctx, reply.status ?? 200, reply.data, reply.headers, isHead, closeAfterReply, rt.logger, serializeResponse);
                recordStatus(sentStatus);
            }
            else if (reply.kind === 'text') {
                recordStatus(etag ? sendTextWithEtag(res, ctx, reply, isHead) : sendText(res, ctx, reply, isHead, closeAfterReply));
            }
            else {
                sendEmpty(res, ctx, reply.status, reply.headers, closeAfterReply);
                recordStatus(reply.status);
            }
        }
        else if (reply.kind === 'stream') {
            unsentReply = null;
            reply.body.destroy();
        }
    }
    catch (err) {
        if (fallbackTimer !== null) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
        }
        if (unsentReply?.kind === 'stream')
            unsentReply.body.destroy();
        handleRouteFailure(ctx, err, bodyCollector ?? multipart);
    }
    finally {
        if (fallbackTimer !== null) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
        }
        finishRouteRequest(ctx);
    }
}
