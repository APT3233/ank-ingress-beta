export function createHousekeepingLoop(config) {
    const { hk, logger, metricsHandles, reapIntervalMs, reapBatchSize, purgeIntervalMs, purgeBatchSize } = config;
    const { outboxRetentionMs, inboxRetentionMs, maxPurgeBatchesPerTick, sleepWithWake } = config;
    let wakeReap = null;
    let wakePurge = null;
    async function executeReapOnce() {
        if (!hk) {
            return { reapedJobs: 0, reapedCalculations: 0, expiredReservations: 0 };
        }
        const res = await hk.store.reapExpiredLeases(reapBatchSize);
        if (res.reapedJobs > 0) {
            metricsHandles?.jobsReaped.inc({ kind: 'job' }, res.reapedJobs);
        }
        if (res.reapedCalculations > 0) {
            metricsHandles?.jobsReaped.inc({ kind: 'calculation_run' }, res.reapedCalculations);
        }
        if (res.expiredReservations > 0) {
            metricsHandles?.jobsReaped.inc({ kind: 'quota_reservation' }, res.expiredReservations);
        }
        return res;
    }
    async function executePurgeOnce() {
        if (!hk) {
            return { purgedOutbox: 0, purgedInbox: 0 };
        }
        let totalOutbox = 0;
        let totalInbox = 0;
        let totalReceipts = 0;
        let totalIdempotency = 0;
        let totalRevocations = 0;
        for (let i = 0; i < maxPurgeBatchesPerTick && !config.isStopped(); i++) {
            const batch = await hk.store.purgeExpiredEvents({
                outboxOlderThanMs: outboxRetentionMs,
                inboxOlderThanMs: inboxRetentionMs,
                batchSize: purgeBatchSize,
            });
            totalOutbox += batch.purgedOutbox;
            totalInbox += batch.purgedInbox;
            totalReceipts += batch.purgedReceipts ?? 0;
            totalIdempotency += batch.purgedIdempotencyKeys ?? 0;
            totalRevocations += batch.purgedRevocations ?? 0;
            if (batch.purgedOutbox < purgeBatchSize &&
                batch.purgedInbox < purgeBatchSize &&
                (batch.purgedReceipts ?? 0) < purgeBatchSize &&
                (batch.purgedIdempotencyKeys ?? 0) < purgeBatchSize &&
                (batch.purgedRevocations ?? 0) < purgeBatchSize) {
                break;
            }
        }
        if (totalOutbox > 0) {
            metricsHandles?.eventsPurged.inc({ store: 'outbox' }, totalOutbox);
        }
        if (totalInbox > 0) {
            metricsHandles?.eventsPurged.inc({ store: 'inbox' }, totalInbox);
        }
        if (totalReceipts > 0) {
            metricsHandles?.eventsPurged.inc({ store: 'consumer_receipts' }, totalReceipts);
        }
        if (totalIdempotency > 0) {
            metricsHandles?.eventsPurged.inc({ store: 'idempotency_keys' }, totalIdempotency);
        }
        if (totalRevocations > 0) {
            metricsHandles?.eventsPurged.inc({ store: 'access_token_revocations' }, totalRevocations);
        }
        return {
            purgedOutbox: totalOutbox,
            purgedInbox: totalInbox,
            ...(totalReceipts > 0 ? { purgedReceipts: totalReceipts } : {}),
            ...(totalIdempotency > 0 ? { purgedIdempotencyKeys: totalIdempotency } : {}),
            ...(totalRevocations > 0 ? { purgedRevocations: totalRevocations } : {}),
        };
    }
    async function runReapLoop() {
        if (!hk)
            return;
        while (!config.isStopped()) {
            await sleepWithWake(reapIntervalMs, (fn) => {
                wakeReap = fn;
            });
            if (config.isStopped())
                break;
            const leave = config.enter();
            try {
                await executeReapOnce();
            }
            catch (err) {
                logger?.error('worker.housekeeping_reap_failed', {
                    workerId: config.workerId,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            finally {
                leave();
            }
        }
    }
    async function runPurgeLoop() {
        if (!hk)
            return;
        while (!config.isStopped()) {
            await sleepWithWake(purgeIntervalMs, (fn) => {
                wakePurge = fn;
            });
            if (config.isStopped())
                break;
            const leave = config.enter();
            try {
                await executePurgeOnce();
            }
            catch (err) {
                logger?.error('worker.housekeeping_purge_failed', {
                    workerId: config.workerId,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            finally {
                leave();
            }
        }
    }
    return {
        executeReapOnce,
        executePurgeOnce,
        runReapLoop,
        runPurgeLoop,
        wakeAll() {
            wakeReap?.();
            wakePurge?.();
        },
    };
}
