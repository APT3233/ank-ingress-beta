import { AppError, CompositionError } from '@ank-ingress/kernel';
import { runInScope } from '@ank-ingress/observability';
import { createWorkTracker } from '@ank-ingress/runtime';
import { DEFAULT_BATCH_SIZE, DEFAULT_CONCURRENCY, DEFAULT_INBOX_RETENTION_MS, DEFAULT_JOB_TIMEOUT_MS, DEFAULT_LEASE_MS, DEFAULT_MAX_PURGE_BATCHES_PER_TICK, DEFAULT_OUTBOX_RETENTION_MS, DEFAULT_POLL_INTERVAL_MS, DEFAULT_PURGE_BATCH_SIZE, DEFAULT_PURGE_INTERVAL_MS, DEFAULT_REAP_BATCH_SIZE, DEFAULT_REAP_INTERVAL_MS, DEFAULT_REPLAY_WINDOW_MS, DEFAULT_RETRY_BACKOFF_BASE_MS } from "./job-runner-defaults.js";
import { startLeaseHeartbeat } from "./lease-heartbeat.js";
import { getWorkerMetrics } from "./worker-metrics.js";
import { createHousekeepingLoop } from "./housekeeping-loop.js";
export function createJobRunner(options) {
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    const defaultJobTimeoutMs = options.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
    const retryBackoffBaseMs = options.retryBackoffBaseMs ?? DEFAULT_RETRY_BACKOFF_BASE_MS;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
        throw new CompositionError(`Invalid worker concurrency: ${concurrency}`);
    }
    if (!Number.isInteger(batchSize) || batchSize < 1) {
        throw new CompositionError(`Invalid worker batchSize: ${batchSize}`);
    }
    if (!Number.isFinite(leaseMs) || leaseMs < 100) {
        throw new CompositionError(`Invalid worker leaseMs: ${leaseMs}`);
    }
    const hk = options.housekeeping;
    const outboxRetentionMs = hk?.outboxRetentionMs ?? DEFAULT_OUTBOX_RETENTION_MS;
    const inboxRetentionMs = hk?.inboxRetentionMs ?? DEFAULT_INBOX_RETENTION_MS;
    const replayWindowMs = hk?.replayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS;
    const reapIntervalMs = hk?.reapIntervalMs ?? DEFAULT_REAP_INTERVAL_MS;
    const reapBatchSize = hk?.reapBatchSize ?? DEFAULT_REAP_BATCH_SIZE;
    const purgeIntervalMs = hk?.purgeIntervalMs ?? DEFAULT_PURGE_INTERVAL_MS;
    const purgeBatchSize = hk?.purgeBatchSize ?? DEFAULT_PURGE_BATCH_SIZE;
    const maxPurgeBatchesPerTick = hk?.maxPurgeBatchesPerTick ?? DEFAULT_MAX_PURGE_BATCHES_PER_TICK;
    if (hk) {
        if (inboxRetentionMs <= replayWindowMs || inboxRetentionMs <= outboxRetentionMs) {
            throw new CompositionError(`Inbox retention (${inboxRetentionMs}ms) must be strictly greater than replay window (${replayWindowMs}ms) and outbox retention (${outboxRetentionMs}ms)`);
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlerMap = new Map();
    for (const h of options.handlers) {
        if (handlerMap.has(h.spec.name)) {
            throw new CompositionError(`Duplicate job handler registered for "${h.spec.name}"`);
        }
        handlerMap.set(h.spec.name, h);
    }
    const handlerTypes = Object.freeze([...handlerMap.keys()]);
    const tracker = createWorkTracker();
    const inFlightJobs = new Map();
    const metricsHandles = getWorkerMetrics(options.metrics);
    let stopped = true;
    let pollLoopPromise = null;
    let reapLoopPromise = null;
    let purgeLoopPromise = null;
    let wakePoll = null;
    function sleepWithWake(ms, setWake) {
        if (stopped || ms <= 0)
            return Promise.resolve();
        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                setWake(null);
                resolve();
            };
            const timer = setTimeout(finish, ms);
            setWake(finish);
        });
    }
    const housekeeping = createHousekeepingLoop({
        hk,
        workerId: options.workerId,
        logger: options.logger,
        metricsHandles,
        reapIntervalMs,
        reapBatchSize,
        purgeIntervalMs,
        purgeBatchSize,
        outboxRetentionMs,
        inboxRetentionMs,
        maxPurgeBatchesPerTick,
        isStopped: () => stopped,
        enter: () => tracker.enter(),
        sleepWithWake,
    });
    const { executeReapOnce, executePurgeOnce, runReapLoop, runPurgeLoop } = housekeeping;
    function triggerPollWake() {
        wakePoll?.();
    }
    function startJobExecution(job) {
        const handler = handlerMap.get(job.type);
        if (!handler) {
            return;
        }
        const abortCtrl = new AbortController();
        // claim() grants the runner lease to every type in the batch.
        const effectiveLeaseMs = leaseMs;
        const effectiveTimeoutMs = handler.spec.timeoutMs ?? defaultJobTimeoutMs;
        const heartbeatIntervalMs = Math.max(25, Math.floor(effectiveLeaseMs / 3));
        const leave = tracker.enter();
        let timedOut = false;
        const entry = {
            job,
            abortCtrl,
            done: Promise.resolve(),
            abortedByDrainBudget: false,
        };
        const deadlineAt = performance.now() + effectiveTimeoutMs;
        const expireDeadline = () => {
            if (!abortCtrl.signal.aborted) {
                timedOut = true;
                abortCtrl.abort(new AppError('COMMON-503-UNAVAILABLE', {
                    message: `Job "${job.type}" (${job.id}) exceeded deadline of ${effectiveTimeoutMs}ms`,
                }));
            }
        };
        const deadlineTimer = setTimeout(expireDeadline, effectiveTimeoutMs);
        const hb = startLeaseHeartbeat({
            jobStore: options.jobStore,
            workerId: options.workerId,
            logger: options.logger,
            job,
            abortCtrl,
            leaseMs: effectiveLeaseMs,
            intervalMs: heartbeatIntervalMs,
        });
        const execPromise = (async () => {
            try {
                const output = await runInScope({
                    correlationId: job.correlationId ?? undefined,
                    tenantId: job.tenantId,
                }, () => handler.handle(job, abortCtrl.signal));
                await hb.stop();
                if (hb.isLeaseLost()) {
                    metricsHandles?.jobsCompleted.inc({ job_type: job.type, status: 'lease_lost' });
                    return;
                }
                if (entry.abortedByDrainBudget) {
                    if (options.jobStore.release) {
                        await options.jobStore
                            .release(options.workerId, [job.id], job.leaseGeneration)
                            .catch((relErr) => {
                            options.logger?.warn('worker.job_release_failed', {
                                workerId: options.workerId,
                                jobId: job.id,
                                error: relErr instanceof Error ? relErr.message : String(relErr),
                            });
                        });
                    }
                    metricsHandles?.jobsCompleted.inc({ job_type: job.type, status: 'released' });
                    return;
                }
                if (performance.now() >= deadlineAt)
                    expireDeadline();
                if (timedOut || abortCtrl.signal.aborted) {
                    throw abortCtrl.signal.reason ?? new Error('Job deadline exceeded');
                }
                const completed = await options.jobStore.complete(job.id, output, {
                    worker: options.workerId,
                    leaseGeneration: job.leaseGeneration,
                });
                if (!completed) {
                    options.logger?.warn('worker.job_complete_fenced', {
                        workerId: options.workerId,
                        jobId: job.id,
                        jobType: job.type,
                        leaseGeneration: job.leaseGeneration,
                    });
                    metricsHandles?.jobsCompleted.inc({ job_type: job.type, status: 'lease_lost' });
                }
                else {
                    metricsHandles?.jobsCompleted.inc({ job_type: job.type, status: 'succeeded' });
                }
            }
            catch (err) {
                await hb.stop();
                if (hb.isLeaseLost()) {
                    metricsHandles?.jobsCompleted.inc({ job_type: job.type, status: 'lease_lost' });
                    return;
                }
                if (entry.abortedByDrainBudget) {
                    if (options.jobStore.release) {
                        await options.jobStore
                            .release(options.workerId, [job.id], job.leaseGeneration)
                            .catch((relErr) => {
                            options.logger?.warn('worker.job_release_failed', {
                                workerId: options.workerId,
                                jobId: job.id,
                                error: relErr instanceof Error ? relErr.message : String(relErr),
                            });
                        });
                    }
                    metricsHandles?.jobsCompleted.inc({ job_type: job.type, status: 'released' });
                    return;
                }
                const retryAt = job.attempts < job.maxAttempts
                    ? new Date(Date.now() + retryBackoffBaseMs * Math.pow(2, Math.max(0, job.attempts - 1)))
                    : null;
                const errorCode = err instanceof AppError
                    ? err.code
                    : timedOut
                        ? 'JOB_TIMEOUT'
                        : err instanceof Error
                            ? err.message
                            : String(err);
                const errorDetail = err instanceof Error ? err.message : String(err);
                try {
                    const failedOk = await options.jobStore.fail(job.id, errorCode, retryAt, {
                        worker: options.workerId,
                        leaseGeneration: job.leaseGeneration,
                        errorDetail,
                    });
                    if (!failedOk) {
                        options.logger?.warn('worker.job_fail_fenced', {
                            workerId: options.workerId,
                            jobId: job.id,
                            jobType: job.type,
                            leaseGeneration: job.leaseGeneration,
                        });
                        metricsHandles?.jobsCompleted.inc({ job_type: job.type, status: 'lease_lost' });
                    }
                    else {
                        metricsHandles?.jobsCompleted.inc({
                            job_type: job.type,
                            status: retryAt ? 'retried' : 'failed',
                        });
                    }
                }
                catch (failErr) {
                    options.logger?.error('worker.job_fail_store_error', {
                        workerId: options.workerId,
                        jobId: job.id,
                        jobType: job.type,
                        error: failErr instanceof Error ? failErr.message : String(failErr),
                    });
                }
            }
            finally {
                clearTimeout(deadlineTimer);
                await hb.stop();
                inFlightJobs.delete(job.id);
                leave();
                if (!stopped) {
                    triggerPollWake();
                }
            }
        })();
        entry.done = execPromise;
        inFlightJobs.set(job.id, entry);
    }
    async function runPollLoop() {
        while (!stopped) {
            if (handlerTypes.length === 0) {
                await sleepWithWake(pollIntervalMs, (fn) => {
                    wakePoll = fn;
                });
                continue;
            }
            const availableSlots = concurrency - inFlightJobs.size;
            if (availableSlots <= 0) {
                await sleepWithWake(pollIntervalMs, (fn) => {
                    wakePoll = fn;
                });
                continue;
            }
            const claimLimit = Math.min(batchSize, availableSlots);
            let claimed = [];
            const leaveClaim = tracker.enter();
            try {
                claimed = await options.jobStore.claim(options.workerId, handlerTypes, claimLimit, leaseMs);
            }
            catch (err) {
                options.logger?.error('worker.poll_claim_failed', {
                    workerId: options.workerId,
                    error: err instanceof Error ? err.message : String(err),
                });
                leaveClaim();
                await sleepWithWake(pollIntervalMs, (fn) => {
                    wakePoll = fn;
                });
                continue;
            }
            leaveClaim();
            if (stopped) {
                if (claimed.length > 0 && options.jobStore.release) {
                    await options.jobStore
                        .release(options.workerId, claimed.map((j) => j.id))
                        .catch(() => { });
                }
                break;
            }
            for (const job of claimed) {
                startJobExecution(job);
            }
            if (claimed.length === 0 || inFlightJobs.size >= concurrency) {
                await sleepWithWake(pollIntervalMs, (fn) => {
                    wakePoll = fn;
                });
            }
        }
    }
    return {
        async start() {
            if (!stopped)
                return;
            stopped = false;
            pollLoopPromise = runPollLoop();
            if (hk) {
                reapLoopPromise = runReapLoop();
                purgeLoopPromise = runPurgeLoop();
            }
        },
        async stop() {
            stopped = true;
            wakePoll?.();
            housekeeping.wakeAll();
            await Promise.all([
                pollLoopPromise?.catch(() => { }),
                reapLoopPromise?.catch(() => { }),
                purgeLoopPromise?.catch(() => { }),
            ]);
            pollLoopPromise = null;
            reapLoopPromise = null;
            purgeLoopPromise = null;
        },
        async drain(signal) {
            const abortRemainingJobs = () => {
                const reason = signal.reason instanceof Error
                    ? signal.reason
                    : new Error('Worker shutdown drain budget exceeded');
                for (const entry of inFlightJobs.values()) {
                    entry.abortedByDrainBudget = true;
                    if (!entry.abortCtrl.signal.aborted) {
                        entry.abortCtrl.abort(reason);
                    }
                }
            };
            if (signal.aborted) {
                abortRemainingJobs();
            }
            else {
                signal.addEventListener('abort', abortRemainingJobs, { once: true });
            }
            try {
                await tracker.idle(signal);
            }
            finally {
                signal.removeEventListener('abort', abortRemainingJobs);
            }
            if (signal.aborted && inFlightJobs.size > 0) {
                const pending = [...inFlightJobs.values()].map((e) => e.done.catch(() => { }));
                await Promise.race([
                    Promise.all(pending),
                    new Promise((r) => setTimeout(r, 250)),
                ]);
            }
        },
        async runReapOnce() {
            const prevStopped = stopped;
            if (prevStopped) {
                stopped = false;
            }
            try {
                return await executeReapOnce();
            }
            finally {
                if (prevStopped) {
                    stopped = true;
                }
            }
        },
        async runPurgeOnce() {
            const prevStopped = stopped;
            if (prevStopped) {
                stopped = false;
            }
            try {
                return await executePurgeOnce();
            }
            finally {
                if (prevStopped) {
                    stopped = true;
                }
            }
        },
    };
}
