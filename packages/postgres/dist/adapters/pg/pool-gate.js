import { AppError } from '@ank-ingress/kernel';
const waitingGaugeCache = new WeakMap();
function getWaitingGauge(metrics) {
    let g = waitingGaugeCache.get(metrics);
    if (!g) {
        g = metrics.gauge('ank_db_pool_waiting', 'Number of callers waiting for a database connection', ['pool']);
        waitingGaugeCache.set(metrics, g);
    }
    return g;
}
const NEVER_ABORTED_SIGNAL = new AbortController().signal;
export function createPoolGate(pool, options) {
    const maxWaiting = options.maxWaiting;
    const maxConnections = options.maxConnections ??
        pool.options?.max ??
        1;
    const waitingGauge = options.metrics
        ? getWaitingGauge(options.metrics).bind({ pool: options.poolName ?? 'default' })
        : undefined;
    let activeSlots = 0;
    const waitQueue = [];
    const updateGauge = () => {
        waitingGauge?.set(waitQueue.length);
    };
    updateGauge();
    const wrapClient = (client) => {
        const origRelease = client.release.bind(client);
        let released = false;
        const wrappedRelease = (err) => {
            if (released)
                return;
            released = true;
            client.release = origRelease;
            try {
                origRelease(err);
            }
            finally {
                releaseSlot();
            }
        };
        client.release = wrappedRelease;
        return client;
    };
    const connectWithReservedSlot = (signal, resolve, reject) => {
        let abortedWhileConnecting = false;
        const onConnectAbort = () => {
            abortedWhileConnecting = true;
            reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Aborted while acquiring DB connection' }));
        };
        if (signal.aborted) {
            releaseSlot();
            reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Request aborted before acquiring DB connection' }));
            return;
        }
        signal.addEventListener('abort', onConnectAbort, { once: true });
        pool.connect().then((rawClient) => {
            signal.removeEventListener('abort', onConnectAbort);
            if (abortedWhileConnecting) {
                try {
                    rawClient.release();
                }
                finally {
                    releaseSlot();
                }
                return;
            }
            resolve(wrapClient(rawClient));
        }, (err) => {
            signal.removeEventListener('abort', onConnectAbort);
            releaseSlot();
            if (abortedWhileConnecting)
                return;
            reject(new AppError('COMMON-503-UNAVAILABLE', {
                message: 'Failed to acquire database connection',
                cause: err,
            }));
        });
    };
    const releaseSlot = () => {
        while (waitQueue.length > 0) {
            const next = waitQueue.shift();
            updateGauge();
            if (next.settled)
                continue;
            next.settled = true;
            next.signal.removeEventListener('abort', next.onAbort);
            connectWithReservedSlot(next.signal, next.resolve, next.reject);
            return;
        }
        activeSlots = Math.max(0, activeSlots - 1);
    };
    return {
        get waiting() {
            return waitQueue.length;
        },
        acquire(signal = NEVER_ABORTED_SIGNAL) {
            if (signal.aborted) {
                return Promise.reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Request aborted before acquiring DB connection' }));
            }
            if (activeSlots < maxConnections && waitQueue.length === 0) {
                activeSlots += 1;
                return new Promise((resolve, reject) => {
                    connectWithReservedSlot(signal, resolve, reject);
                });
            }
            if (waitQueue.length >= maxWaiting) {
                return Promise.reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Database connection waiting queue full' }));
            }
            return new Promise((resolve, reject) => {
                const waiter = {
                    signal,
                    resolve,
                    reject,
                    settled: false,
                    onAbort() {
                        if (waiter.settled)
                            return;
                        waiter.settled = true;
                        const idx = waitQueue.indexOf(waiter);
                        if (idx !== -1) {
                            waitQueue.splice(idx, 1);
                            updateGauge();
                        }
                        reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Aborted while waiting for DB connection' }));
                    },
                };
                signal.addEventListener('abort', waiter.onAbort, { once: true });
                waitQueue.push(waiter);
                updateGauge();
            });
        },
    };
}
