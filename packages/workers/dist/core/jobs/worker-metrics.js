export const workerMetricsCache = new WeakMap();
export function getWorkerMetrics(metrics) {
    if (!metrics)
        return null;
    let handles = workerMetricsCache.get(metrics);
    if (!handles) {
        handles = {
            jobsCompleted: metrics.counter('ank_worker_jobs_total', 'Total worker jobs processed by type and status', ['job_type', 'status']),
            jobsReaped: metrics.counter('ank_worker_reaped_leases_total', 'Total expired leases reaped by kind', ['kind']),
            eventsPurged: metrics.counter('ank_worker_purged_events_total', 'Total expired outbox/inbox events purged', ['store']),
        };
        workerMetricsCache.set(metrics, handles);
    }
    return handles;
}
