import { Reply } from '@ank-ingress/contracts';
import { AppError } from '@ank-ingress/kernel';
import { runIdempotentWrite } from "./idempotent-run.js";
import { withTx } from "./with-tx.js";
export function createRequestScope(options) {
    const defaultGraceMs = options.idempotencyGraceMs ?? 5_000;
    return {
        async authorize(params) {
            let resolvedAccess;
            return withTx(options.db, {
                deadlineAt: params.deadlineAt,
                readOnly: true,
                signal: params.signal,
                ...(options.catalogs ? { catalogs: options.catalogs } : {}),
                hasCustomInitTimeout: true,
                ...(options.initializer.afterReadCommit
                    ? {
                        async afterCommit(tx, postCommitTimeoutMs) {
                            if (resolvedAccess !== undefined) {
                                await options.initializer.afterReadCommit(tx, params.identity, resolvedAccess, postCommitTimeoutMs);
                            }
                        },
                    }
                    : {}),
            }, async (tx, statementTimeoutMs) => {
                if (options.revocation && params.identity.claims && params.identity.revocationDeferred) {
                    await options.revocation.check(params.identity.claims, params.signal, tx);
                }
                const access = await options.initializer.open(tx, params.identity, statementTimeoutMs, {
                    readOnly: true,
                });
                options.policy.authorize(access, params.permission ?? null, params.scopeParam === undefined ? {} : { param: params.scopeParam });
                resolvedAccess = access;
                return access;
            });
        },
        async run(params, handler) {
            const isReadOnly = params.readOnly === true;
            const isIdempotentWrite = !isReadOnly && Boolean(params.idempotencyKey && options.idempotency);
            if (!isIdempotentWrite) {
                let resolvedAccess;
                return withTx(options.db, {
                    deadlineAt: params.deadlineAt,
                    readOnly: isReadOnly,
                    signal: params.signal,
                    ...(options.catalogs ? { catalogs: options.catalogs } : {}),
                    hasCustomInitTimeout: true,
                    ...(isReadOnly && options.initializer.afterReadCommit
                        ? {
                            async afterCommit(tx, postCommitTimeoutMs) {
                                if (resolvedAccess !== undefined) {
                                    await options.initializer.afterReadCommit(tx, params.identity, resolvedAccess, postCommitTimeoutMs);
                                }
                            },
                        }
                        : {}),
                }, async (tx, statementTimeoutMs) => {
                    if (options.revocation && params.identity.claims && params.identity.revocationDeferred) {
                        await options.revocation.check(params.identity.claims, params.signal, tx);
                    }
                    const access = await options.initializer.open(tx, params.identity, statementTimeoutMs, {
                        readOnly: isReadOnly,
                    });
                    options.policy.authorize(access, params.permission ?? null, params.scopeParam === undefined ? {} : { param: params.scopeParam });
                    resolvedAccess = access;
                    const executionSignal = tx.signal ?? params.signal;
                    if (executionSignal.aborted || Date.now() >= params.deadlineAt) {
                        throw new AppError('COMMON-503-UNAVAILABLE', { message: 'Request cancelled before handler execution' });
                    }
                    return handler(tx, access, executionSignal, params.deadlineAt);
                });
            }
            return runIdempotentWrite(options, params, handler, defaultGraceMs);
        },
    };
}
