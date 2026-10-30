import { Reply, isEmptyReplyStatus } from '@ank-ingress/contracts';
import { AppError } from '@ank-ingress/kernel';
import { withTx } from "./with-tx.js";
export async function runIdempotentWrite(options, params, handler, defaultGraceMs) {
    // Idempotent write: decouple HTTP response cancellation from execution cancellation once handler starts
    const graceMs = params.idempotencyGraceMs ?? defaultGraceMs;
    const execAbort = new AbortController();
    let handlerStarted = false;
    let graceTimer;
    const onCallerAbort = () => {
        if (!handlerStarted) {
            if (!execAbort.signal.aborted) {
                execAbort.abort(params.signal.reason ?? new Error('Request aborted before handler started'));
            }
            return;
        }
        if (!graceTimer && !execAbort.signal.aborted) {
            graceTimer = setTimeout(() => {
                if (!execAbort.signal.aborted) {
                    execAbort.abort(new AppError('COMMON-503-UNAVAILABLE', {
                        message: 'Idempotent execution grace budget exceeded',
                    }));
                }
            }, graceMs);
        }
    };
    if (params.signal.aborted) {
        onCallerAbort();
    }
    else {
        params.signal.addEventListener('abort', onCallerAbort, { once: true });
    }
    try {
        return await withTx(options.db, {
            deadlineAt: params.deadlineAt + graceMs,
            readOnly: false,
            signal: execAbort.signal,
            ...(options.catalogs ? { catalogs: options.catalogs } : {}),
            hasCustomInitTimeout: true,
        }, async (tx) => {
            if (params.signal.aborted || Date.now() >= params.deadlineAt) {
                throw new AppError('COMMON-503-UNAVAILABLE', {
                    message: 'Request deadline exceeded before opening idempotent context',
                });
            }
            if (options.revocation && params.identity.claims && params.identity.revocationDeferred) {
                await options.revocation.check(params.identity.claims, params.signal, tx);
            }
            const preHandlerRemainingMs = Math.max(10, Math.floor(params.deadlineAt - Date.now() - 25));
            const openPromise = options.initializer.open(tx, params.identity, preHandlerRemainingMs, {
                readOnly: false,
            });
            const claimPromise = options.idempotency.claim(tx, params.idempotencyKey);
            claimPromise.catch(() => { });
            const access = await openPromise;
            options.policy.authorize(access, params.permission ?? null, params.scopeParam === undefined ? {} : { param: params.scopeParam });
            const claim = await claimPromise;
            if (claim.kind === 'replay') {
                const replayHeaders = {
                    ...(claim.result.headers ?? {}),
                    'x-idempotent-replay': 'true',
                    'idempotent-replayed': 'true',
                };
                if (claim.result.kind === 'empty') {
                    const status = isEmptyReplyStatus(claim.result.status) ? claim.result.status : 204;
                    return { kind: 'empty', status, headers: replayHeaders };
                }
                return Reply.json(claim.result.body, {
                    status: claim.result.status,
                    headers: replayHeaders,
                });
            }
            if (claim.kind === 'mismatch') {
                throw new AppError('COMMON-409-IDEMPOTENCY_MISMATCH', {
                    message: 'Idempotency key reused with different request payload',
                });
            }
            if (claim.kind === 'pending') {
                throw new AppError('COMMON-409-IDEMPOTENCY_IN_PROGRESS', {
                    message: 'Request with this idempotency key is currently in progress',
                });
            }
            // Before starting the handler, verify the caller has not already aborted or timed out
            if (params.signal.aborted || Date.now() >= params.deadlineAt) {
                throw new AppError('COMMON-503-UNAVAILABLE', {
                    message: 'Request cancelled before idempotent handler started',
                });
            }
            // Configure execution timeout before considering the handler started.
            const execDeadlineAt = Math.max(params.deadlineAt, Date.now() + graceMs);
            const execRemainingMs = Math.max(preHandlerRemainingMs, Math.floor(execDeadlineAt - Date.now() - 25));
            if (execRemainingMs > preHandlerRemainingMs + 250) {
                await tx.query(`SELECT set_config('statement_timeout', $1, true)`, [String(execRemainingMs)]);
            }
            if (params.signal.aborted || Date.now() >= params.deadlineAt) {
                throw new AppError('COMMON-503-UNAVAILABLE', { message: 'Request cancelled during handler setup' });
            }
            handlerStarted = true;
            const reply = await handler(tx, access, tx.signal ?? execAbort.signal, execDeadlineAt);
            if (reply.kind === 'json') {
                let serializedBody;
                try {
                    const rawJson = JSON.stringify(reply.data ?? null);
                    if (rawJson === undefined) {
                        throw new Error('JSON.stringify returned undefined');
                    }
                    serializedBody = JSON.parse(rawJson);
                }
                catch (err) {
                    throw new AppError('COMMON-500-INTERNAL', {
                        message: 'Failed to serialize response payload before idempotent save',
                        cause: err,
                    });
                }
                await options.idempotency.save(tx, params.idempotencyKey, {
                    status: reply.status ?? 200,
                    body: serializedBody,
                    kind: 'json',
                    ...(reply.headers ? { headers: reply.headers } : {}),
                });
                return { ...reply, data: serializedBody };
            }
            else if (reply.kind === 'empty') {
                await options.idempotency.save(tx, params.idempotencyKey, {
                    status: reply.status ?? 204,
                    body: null,
                    kind: 'empty',
                    ...(reply.headers ? { headers: reply.headers } : {}),
                });
            }
            else if (reply.kind === 'text') {
                // Fail before commit so the key is not left without a stored result.
                throw new AppError('COMMON-500-INTERNAL', {
                    message: 'Idempotent routes must reply with json or empty',
                });
            }
            return reply;
        });
    }
    finally {
        if (graceTimer)
            clearTimeout(graceTimer);
        params.signal.removeEventListener('abort', onCallerAbort);
    }
}
