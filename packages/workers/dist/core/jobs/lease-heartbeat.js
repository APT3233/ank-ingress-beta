export function startLeaseHeartbeat({ jobStore, workerId, logger, job, abortCtrl, leaseMs, intervalMs }) {
    let leaseLost = false;
    let heartbeatStopped = false;
    let wakeHeartbeat = null;
    let lastRenewedAt = Date.now();
    const heartbeatLoopPromise = (async () => {
        if (!jobStore.heartbeat)
            return;
        while (!heartbeatStopped && !abortCtrl.signal.aborted) {
            await new Promise((resolve) => {
                let settled = false;
                const finish = () => {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(hbTimer);
                    wakeHeartbeat = null;
                    resolve();
                };
                const hbTimer = setTimeout(finish, intervalMs);
                wakeHeartbeat = finish;
            });
            if (heartbeatStopped || abortCtrl.signal.aborted)
                break;
            try {
                const renewed = await jobStore.heartbeat(job.id, workerId, leaseMs, job.leaseGeneration);
                if (renewed) {
                    lastRenewedAt = Date.now();
                }
                else if (!heartbeatStopped) {
                    leaseLost = true;
                    logger?.warn('worker.job_lease_lost', {
                        workerId: workerId,
                        jobId: job.id,
                        jobType: job.type,
                        leaseGeneration: job.leaseGeneration,
                    });
                    if (!abortCtrl.signal.aborted) {
                        abortCtrl.abort(new Error(`Lease lost for job ${job.id}`));
                    }
                    break;
                }
            }
            catch (hbErr) {
                logger?.error('worker.job_heartbeat_failed', {
                    workerId: workerId,
                    jobId: job.id,
                    jobType: job.type,
                    error: hbErr instanceof Error ? hbErr.message : String(hbErr),
                });
                if (!heartbeatStopped && Date.now() - lastRenewedAt >= leaseMs) {
                    leaseLost = true;
                    logger?.warn('worker.job_lease_lost', {
                        workerId: workerId,
                        jobId: job.id,
                        jobType: job.type,
                        leaseGeneration: job.leaseGeneration,
                    });
                    if (!abortCtrl.signal.aborted) {
                        abortCtrl.abort(new Error(`Lease expired for job ${job.id}`));
                    }
                    break;
                }
            }
        }
    })();
    return {
        async stop() {
            heartbeatStopped = true;
            wakeHeartbeat?.();
            await heartbeatLoopPromise.catch(() => { });
        },
        isLeaseLost() {
            return leaseLost;
        },
    };
}
