import { createClient } from 'redis';
function makeRawClient(url, baseMs, connectTimeoutMs) {
    return createClient({
        url,
        disableOfflineQueue: true,
        socket: {
            connectTimeout: connectTimeoutMs,
            reconnectStrategy(retries) {
                return Math.min(baseMs * Math.max(1, retries), 1000);
            },
        },
    });
}
async function closeRedisClient(client) {
    if (!client.isOpen)
        return;
    if (client.isReady) {
        try {
            await client.quit();
            return;
        }
        catch {
            // Fall through to destroy when quit fails
        }
    }
    if (client.isOpen) {
        client.destroy();
    }
}
export async function createRedis(config) {
    const baseMs = config.reconnectBaseMs ?? 50;
    const connectTimeoutMs = config.connectTimeoutMs ?? 2_000;
    const required = config.required ?? false;
    const resolvedUrl = typeof config.url === 'string' ? config.url : config.url.current();
    const cmd = makeRawClient(resolvedUrl, baseMs, connectTimeoutMs);
    const sub = cmd.duplicate();
    const blocking = cmd.duplicate();
    // Prevent unhandled error events from crashing the process during transient reconnects
    const noopError = () => { };
    cmd.on('error', noopError);
    sub.on('error', noopError);
    blocking.on('error', noopError);
    const resource = {
        name: config.name ?? 'redis',
        required,
        async check() {
            if (!cmd.isReady) {
                throw new Error('Redis command client is not ready');
            }
            const res = await cmd.ping();
            if (res !== 'PONG') {
                throw new Error(`unexpected redis ping response: ${res}`);
            }
        },
        async close() {
            await Promise.allSettled([
                closeRedisClient(cmd),
                closeRedisClient(sub),
                closeRedisClient(blocking),
            ]);
        },
    };
    let firstConnectErr;
    const firstErrorPromise = new Promise((resolve) => {
        const onFirstErr = (err) => {
            if (!firstConnectErr) {
                firstConnectErr = err instanceof Error ? err : new Error(String(err));
            }
            resolve('error');
        };
        cmd.once('error', onFirstErr);
        sub.once('error', onFirstErr);
        blocking.once('error', onFirstErr);
    });
    const connectAllPromise = Promise.all([
        cmd.connect(),
        sub.connect(),
        blocking.connect(),
    ]).then(() => 'connected');
    // Avoid unhandled rejections if connect() rejects after timeout or during background reconnect
    connectAllPromise.catch(noopError);
    let timer;
    const timeoutPromise = new Promise((resolve) => {
        timer = setTimeout(() => resolve('timeout'), connectTimeoutMs);
    });
    try {
        const outcome = await Promise.race(required
            ? [connectAllPromise, timeoutPromise]
            : [connectAllPromise, firstErrorPromise, timeoutPromise]);
        if (outcome !== 'connected' && required) {
            await resource.close();
            throw (firstConnectErr ??
                new Error(`Redis initial connection timed out after ${connectTimeoutMs}ms`));
        }
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
    return { cmd, sub, blocking, resource };
}
