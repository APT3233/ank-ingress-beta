import { runInScope } from '@ank-ingress/observability';
import { sendEmpty, sendText } from "../send/send-basic.js";
import { sendJsonWithEtag, sendTextWithEtag } from "../send/send-etag.js";
import { sendJson } from "../send/send-json.js";
import { sendStream } from "../send/send-stream.js";
// Closures below read route values through `env` so each captures only `env` and per-request values.
export function failPublic(env, ctx, error) {
    env.clearPublicDeadline(ctx);
    env.rt.activeStreams?.delete(ctx);
    try {
        env.handleRouteFailure(ctx, error, null);
    }
    catch (failure) {
        try {
            env.rt.logger.error('http.unhandled_pipeline_error', { correlationId: ctx.correlationId,
                error: failure instanceof Error ? failure.message : String(failure) });
        }
        catch { /* Preserve cleanup if logging fails. */ }
        try {
            if (!ctx.socketAborted)
                ctx.res.close();
        }
        catch { /* Native connection already closed. */ }
        env.finishRouteRequest(ctx);
    }
}
/** `corked` is true when called synchronously from the uWS route callback (uWS already corked the socket). */
export function completePublic(env, ctx, reply, corked) {
    try {
        // One monotonic clock read serves both the deadline check and the duration metric.
        const endTime = performance.now();
        if (endTime - ctx.startTime >= env.compiled.timeoutMs && !ctx.aborted)
            env.onRouteDeadlineExpire(ctx);
        if (!ctx.writable) {
            if (reply.kind === 'stream')
                reply.body.destroy();
            env.finishRouteRequest(ctx, endTime);
            return;
        }
        if (reply.kind === 'stream') {
            ctx.attachOnAborted();
            env.clearPublicDeadline(ctx);
            env.rt.activeStreams?.add(ctx);
            sendStream(ctx.res, ctx, reply, env.isHead).then(() => {
                try {
                    env.rt.activeStreams?.delete(ctx);
                    env.recordStatus(reply.status ?? 200);
                    env.finishRouteRequest(ctx);
                }
                catch (error) {
                    failPublic(env, ctx, error);
                }
            }, (error) => failPublic(env, ctx, error));
            return;
        }
        if (reply.kind === 'json') {
            env.recordStatus(env.etag
                ? sendJsonWithEtag(ctx.res, ctx, reply, env.isHead, env.rt.logger, env.serializeResponse)
                : sendJson(ctx.res, ctx, reply.status ?? 200, reply.data, reply.headers, env.isHead, false, env.rt.logger, env.serializeResponse, corked));
        }
        else if (reply.kind === 'text') {
            env.recordStatus(env.etag ? sendTextWithEtag(ctx.res, ctx, reply, env.isHead) : sendText(ctx.res, ctx, reply, env.isHead));
        }
        else {
            sendEmpty(ctx.res, ctx, reply.status, reply.headers, false);
            env.recordStatus(reply.status);
        }
        env.finishRouteRequest(ctx, endTime);
    }
    catch (error) {
        failPublic(env, ctx, error);
    }
}
/**
 * Public routes without body, auth, audit or rate limit. Actual returned values determine sync/async
 * completion; no source prediction or Reply-construction side channel. Both views are immutable for public work.
 */
export function runPublicRoute(env, ctx) {
    try {
        if (env.paramLen > 0)
            ctx.params = env.compiled.validateParams(ctx.params);
        if (env.compiled.needsQuery)
            ctx.query = env.compiled.validateQuery(ctx.queryRaw);
        // Only validation can spend the budget before the handler; without it there is nothing to check.
        if (env.validatesBeforeHandler && Date.now() >= ctx.deadlineAt) {
            env.onRouteDeadlineExpire(ctx);
            env.finishRouteRequest(ctx);
            return;
        }
        runInScope(ctx, () => {
            const returned = env.compiled.spec.handle(ctx, ctx);
            if (typeof returned.then === 'function') {
                ctx.attachOnAborted();
                const rt = env.rt;
                if (rt.deadlineWheel && env.routeDeadlineLane !== null) {
                    rt.deadlineWheel.scheduleLane(ctx, env.routeDeadlineLane, env.onRouteDeadlineExpire);
                }
                else if (rt.deadlineWheel) {
                    rt.deadlineWheel.schedule(ctx, env.compiled.timeoutMs, env.onRouteDeadlineExpire);
                }
                else {
                    env.fallbackPublicDeadlines.set(ctx, setTimeout(() => env.onRouteDeadlineExpire(ctx), Math.max(0, ctx.deadlineAt - Date.now())));
                }
                if (Date.now() >= ctx.deadlineAt)
                    env.onRouteDeadlineExpire(ctx);
                returned.then((reply) => completePublic(env, ctx, reply, false), (error) => failPublic(env, ctx, error));
            }
            else {
                completePublic(env, ctx, returned, true);
            }
        });
    }
    catch (error) {
        failPublic(env, ctx, error);
    }
}
