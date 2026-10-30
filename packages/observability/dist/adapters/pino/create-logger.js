import pino from 'pino';
import { sanitizeLogValue } from "../../core/logging/redaction.js";
import { currentScope } from "../../core/logging/scope.js";
function materializeScope(scope) {
    const out = {};
    if (scope.correlationId !== undefined)
        out.correlationId = scope.correlationId;
    if (scope.traceId !== undefined)
        out.traceId = scope.traceId;
    if (scope.spanId !== undefined)
        out.spanId = scope.spanId;
    if (scope.traceparent !== undefined)
        out.traceparent = scope.traceparent;
    if (scope.tenantId !== undefined)
        out.tenantId = scope.tenantId;
    if (scope.accountId !== undefined)
        out.accountId = scope.accountId;
    if (scope.operation !== undefined)
        out.operation = scope.operation;
    return out;
}
function triggerAsyncFlush(dest) {
    if ('flush' in dest && typeof dest.flush === 'function') {
        try {
            dest.flush();
        }
        catch {
            // Ignore flush errors on closed streams
        }
    }
}
function wrapPino(raw, dest, flushTimer) {
    const write = (method, event, fields) => {
        if (!raw.isLevelEnabled(method))
            return;
        const scope = currentScope();
        const safeFields = fields !== undefined ? sanitizeLogValue(fields, 0) : undefined;
        if (scope === undefined) {
            if (safeFields === undefined) {
                raw[method](event);
            }
            else {
                raw[method](safeFields, event);
            }
        }
        else {
            const scopeObj = materializeScope(scope);
            if (safeFields === undefined) {
                raw[method](scopeObj, event);
            }
            else {
                raw[method]({ ...scopeObj, ...safeFields }, event);
            }
        }
        if (method === 'error' || method === 'fatal') {
            triggerAsyncFlush(dest);
        }
    };
    return {
        debug: (event, fields) => write('debug', event, fields),
        info: (event, fields) => write('info', event, fields),
        warn: (event, fields) => write('warn', event, fields),
        error: (event, fields) => write('error', event, fields),
        fatal: (event, fields) => write('fatal', event, fields),
        child: (bindings) => wrapPino(raw.child(sanitizeLogValue(bindings, 0)), dest, flushTimer),
        flush: () => new Promise((resolve) => {
            if ('flush' in dest && typeof dest.flush === 'function') {
                dest.flush(() => resolve());
            }
            else {
                setImmediate(resolve);
            }
        }),
    };
}
export function createLogger(options) {
    const dest = options.destination ??
        pino.destination({
            fd: 1,
            sync: false,
            minLength: 4096,
        });
    const flushIntervalMs = options.flushIntervalMs ?? 1_000;
    let flushTimer = null;
    if ('flush' in dest && typeof dest.flush === 'function' && flushIntervalMs > 0) {
        flushTimer = setInterval(() => {
            triggerAsyncFlush(dest);
        }, flushIntervalMs);
        flushTimer.unref();
    }
    const raw = pino({
        level: options.level ?? 'info',
        messageKey: 'event',
        base: {
            service: options.service,
            ...(options.instanceId ? { instanceId: options.instanceId } : {}),
        },
        ...(options.redactPaths
            ? {
                redact: {
                    paths: [...options.redactPaths],
                    censor: '[REDACTED]',
                },
            }
            : {}),
    }, dest);
    return wrapPino(raw, dest, flushTimer);
}
