import { integer, oneOf, optional, text } from '@ank-ingress/config';
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'];
export const STATES = ['STARTING', 'READY', 'DEGRADED', 'NOT_READY', 'DRAINING', 'STOPPED'];
export const CHECK_TIMEOUT_MS = 2_000;
export const INSTANCE_ID_RE = /^[a-z0-9][a-z0-9.-]{0,62}$/;
export function makeInstanceId(hostname, pid, suffix) {
    const cleanHost = hostname
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || 'node';
    return `${cleanHost}-${pid}-${suffix}`.slice(0, 63);
}
export function runtimeSchema(app) {
    const prefix = app.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    return {
        logLevel: optional('LOG_LEVEL', oneOf(LOG_LEVELS), 'info'),
        healthPort: optional(`${prefix}_HEALTH_PORT`, integer(0, 65535), 0),
        healthHost: optional('HEALTH_BIND_ADDRESS', text, '127.0.0.1'),
        instanceId: optional('ANK_INSTANCE_ID', (raw) => {
            if (!INSTANCE_ID_RE.test(raw))
                throw new Error('expected [a-z0-9][a-z0-9.-]{0,62}');
            return raw;
        }, ''),
        shutdownDelayMs: optional('SHUTDOWN_DELAY_MS', integer(0, 120_000), 0),
        shutdownTimeoutMs: optional('SHUTDOWN_TIMEOUT_MS', integer(1_000, 600_000), 25_000),
        shutdownFatalTimeoutMs: optional('SHUTDOWN_FATAL_TIMEOUT_MS', integer(500, 60_000), 5_000),
        startupJitterMs: optional('STARTUP_JITTER_MS', integer(0, 120_000), 0),
        checkIntervalMs: optional('HEALTH_CHECK_INTERVAL_MS', integer(50, 300_000), 5_000),
    };
}
