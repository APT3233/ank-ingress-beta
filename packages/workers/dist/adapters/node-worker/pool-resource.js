export function workerPoolResource(pool, name = 'worker-pool') {
    return {
        name,
        required: true,
        async check() {
            if (pool.activeWorkers + pool.replacingWorkers <= 0) {
                throw new Error('No active workers in pool');
            }
        },
        drain(signal) {
            return pool.drain(signal);
        },
        close() {
            return pool.close();
        },
    };
}
