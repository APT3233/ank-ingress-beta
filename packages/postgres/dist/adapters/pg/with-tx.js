import { AppError } from '@ank-ingress/kernel';
import { classifyDbError } from "../../core/errors/classify-db-error.js";
import { discardPgClient } from "./pool.js";
export async function withTx(db, options, fn) {
    const budgetAbort = new AbortController();
    const budgetTimer = setTimeout(() => budgetAbort.abort(new AppError('COMMON-503-UNAVAILABLE', {
        message: 'Transaction deadline exceeded',
    })), Math.max(0, options.deadlineAt - Date.now()));
    const signal = AbortSignal.any([options.signal, budgetAbort.signal]);
    const maxAttempts = options.maxAttempts ?? 3;
    try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const now = Date.now();
            if (signal.aborted || now >= options.deadlineAt) {
                throw new AppError('COMMON-503-UNAVAILABLE', {
                    message: 'Request deadline exceeded before opening transaction',
                });
            }
            const client = await db.gate.acquire(signal);
            let released = false;
            const release = (discard = false) => {
                if (released)
                    return;
                released = true;
                if (discard)
                    discardPgClient(client);
                else
                    client.release();
            };
            if (signal.aborted || Date.now() >= options.deadlineAt) {
                release();
                throw new AppError('COMMON-503-UNAVAILABLE', { message: 'Transaction deadline exceeded while acquiring connection' });
            }
            const onAbort = () => release(true);
            signal.addEventListener('abort', onAbort, { once: true });
            const supportsPipeline = Boolean(client.pipeline);
            let hasSideEffect = false;
            const queuedBeforeCommit = [];
            const afterCommitCallbacks = [];
            const tx = {
                client,
                signal,
                cancel(reason) { budgetAbort.abort(reason ?? new AppError('COMMON-503-UNAVAILABLE', { message: 'Transaction cancelled' })); },
                afterCommit(callback) { afterCommitCallbacks.push(callback); },
                query(text, values) {
                    if (signal.aborted || Date.now() >= options.deadlineAt) {
                        return Promise.reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Transaction execution budget exhausted' }));
                    }
                    return client.query(text, values ? [...values] : undefined);
                },
                markSideEffect() {
                    hasSideEffect = true;
                },
                ...(supportsPipeline
                    ? {
                        queueBeforeCommit(promise) {
                            promise.catch(() => { });
                            queuedBeforeCommit.push(promise);
                        },
                    }
                    : {}),
            };
            let commitStarted = false;
            let committed = false;
            let beginPromise;
            let timeoutPromise;
            try {
                const remainingMs = Math.max(10, Math.floor(options.deadlineAt - Date.now() - 25));
                let beginCmd = 'BEGIN';
                if (options.isolation === 'repeatable read') {
                    beginCmd += ' ISOLATION LEVEL REPEATABLE READ';
                }
                else if (options.isolation === 'read committed') {
                    beginCmd += ' ISOLATION LEVEL READ COMMITTED';
                }
                if (options.readOnly) {
                    beginCmd += ' READ ONLY';
                }
                if (supportsPipeline) {
                    beginPromise = client.query(beginCmd);
                    beginPromise.catch(() => { });
                    if (!options.hasCustomInitTimeout) {
                        timeoutPromise = client.query(`SELECT set_config('statement_timeout', $1, true)`, [String(remainingMs)]);
                        timeoutPromise.catch(() => { });
                    }
                }
                else {
                    await client.query(beginCmd);
                    if (!options.hasCustomInitTimeout) {
                        await client.query(`SELECT set_config('statement_timeout', $1, true)`, [String(remainingMs)]);
                    }
                }
                if (signal.aborted || Date.now() >= options.deadlineAt) {
                    throw new AppError('COMMON-503-UNAVAILABLE', { message: 'Transaction deadline exceeded during initialization' });
                }
                const result = await fn(tx, remainingMs);
                if (beginPromise) {
                    await beginPromise;
                }
                if (timeoutPromise) {
                    await timeoutPromise;
                }
                if (signal.aborted || Date.now() >= options.deadlineAt) {
                    if (queuedBeforeCommit.length > 0) {
                        await Promise.allSettled(queuedBeforeCommit);
                    }
                    throw new AppError('COMMON-503-UNAVAILABLE', {
                        message: 'Request cancelled before transaction commit',
                    });
                }
                if (queuedBeforeCommit.length > 0)
                    await Promise.all(queuedBeforeCommit);
                if (signal.aborted || Date.now() >= options.deadlineAt) {
                    throw new AppError('COMMON-503-UNAVAILABLE', { message: 'Transaction cancelled while awaiting precommit work' });
                }
                commitStarted = true;
                await client.query('COMMIT');
                committed = true;
                const callbackErrors = [];
                if (options.afterCommit) {
                    const postCommitMs = Math.max(1, Math.floor(options.deadlineAt - Date.now()));
                    try {
                        await options.afterCommit(tx, postCommitMs);
                    }
                    catch (error) {
                        callbackErrors.push(error);
                    }
                }
                for (const callback of afterCommitCallbacks) {
                    try {
                        await callback();
                    }
                    catch (error) {
                        callbackErrors.push(error);
                    }
                }
                if (callbackErrors.length > 0) {
                    // A failed hook may leave its own statements or transaction open on this connection.
                    release(true);
                    throw new AggregateError(callbackErrors, 'Post-commit action failed');
                }
                return result;
            }
            catch (err) {
                if (beginPromise || timeoutPromise || queuedBeforeCommit.length > 0) {
                    await Promise.allSettled([
                        ...(beginPromise ? [beginPromise] : []),
                        ...(timeoutPromise ? [timeoutPromise] : []),
                        ...queuedBeforeCommit,
                    ]);
                }
                if (!committed && !released) {
                    try {
                        await client.query('ROLLBACK');
                    }
                    catch {
                        // Ignore rollback failure on broken connection
                    }
                }
                const { appError, retryable } = classifyDbError(signal.aborted ? new AppError('COMMON-503-UNAVAILABLE', { message: 'Transaction cancelled', cause: err }) : err, options.catalogs);
                if (retryable &&
                    !commitStarted &&
                    !committed &&
                    !hasSideEffect &&
                    attempt < maxAttempts &&
                    !signal.aborted) {
                    const backoffMs = Math.max(20, Math.floor((25 + Math.random() * 50) * 2 ** (attempt - 1)));
                    if (Date.now() + backoffMs < options.deadlineAt) {
                        await new Promise((r) => setTimeout(r, backoffMs));
                        continue;
                    }
                }
                throw appError;
            }
            finally {
                signal.removeEventListener('abort', onAbort);
                release();
            }
        }
        throw new AppError('COMMON-503-UNAVAILABLE', { message: 'Transaction retries exhausted' });
    }
    finally {
        clearTimeout(budgetTimer);
    }
}
