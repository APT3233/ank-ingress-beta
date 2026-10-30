import pg, {} from 'pg';
import { createPoolGate } from "./pool-gate.js";
const poolGaugesCache = new WeakMap();
function getPoolGauges(metrics) {
    let cached = poolGaugesCache.get(metrics);
    if (!cached) {
        cached = {
            total: metrics.gauge('ank_db_pool_total', 'Total number of connections in database pool', ['pool']),
            idle: metrics.gauge('ank_db_pool_idle', 'Number of idle connections in database pool', ['pool']),
        };
        poolGaugesCache.set(metrics, cached);
    }
    return cached;
}
/** Discard an owned connection immediately, including an active pg pipeline. */
export function discardPgClient(client) {
    const connection = client.connection;
    connection?.stream?.destroy();
    client.release(true);
}
export function createPgDatabase(options) {
    const { config } = options;
    const poolName = options.name ?? 'postgres';
    const stopWatch = typeof config.password === 'object' ? config.password.watch() : undefined;
    const pool = new pg.Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: () => (typeof config.password === 'string' ? config.password : config.password.current()),
        application_name: options.applicationName,
        max: config.maxConnections ?? 20,
        idleTimeoutMillis: config.idleTimeoutMs ?? 30_000,
        connectionTimeoutMillis: config.connectionTimeoutMs ?? 5_000,
        pipeline: true,
    });
    pool.on('error', (err) => {
        options.logger.error('postgres.pool_error', {
            pool: poolName,
            detail: err.message,
        });
    });
    if (options.metrics) {
        const gauges = getPoolGauges(options.metrics);
        const totalBound = gauges.total.bind({ pool: poolName });
        const idleBound = gauges.idle.bind({ pool: poolName });
        const syncPoolGauges = () => {
            totalBound.set(pool.totalCount);
            idleBound.set(pool.idleCount);
        };
        syncPoolGauges();
        pool.on('connect', syncPoolGauges);
        pool.on('acquire', syncPoolGauges);
        pool.on('release', syncPoolGauges);
        pool.on('remove', syncPoolGauges);
    }
    const gate = createPoolGate(pool, {
        maxWaiting: config.maxWaiting ?? 64,
        maxConnections: config.maxConnections ?? 20,
        ...(options.metrics ? { metrics: options.metrics } : {}),
        poolName,
    });
    let closed = false;
    const close = async () => {
        if (closed)
            return;
        closed = true;
        stopWatch?.();
        await pool.end();
    };
    const resource = {
        name: poolName,
        required: true,
        async check(signal = new AbortController().signal) {
            const client = await gate.acquire(signal);
            let broken = false;
            try {
                await client.query('SELECT 1');
            }
            catch (err) {
                broken = true;
                throw err;
            }
            finally {
                client.release(broken);
            }
        },
        close,
    };
    return {
        pool,
        gate,
        resource,
        close,
    };
}
