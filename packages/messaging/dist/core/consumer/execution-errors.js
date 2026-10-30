import { AppError } from '@ank-ingress/kernel';
const TRANSIENT_NETWORK_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'ENOTFOUND',
    'EAI_AGAIN',
]);
/** PostgreSQL transient SQLSTATE classes; the default for the consumer runner. */
export function isPostgresTransientSqlState(code) {
    return (code.startsWith('08') ||
        code === '40001' ||
        code === '40P01' ||
        code.startsWith('53') ||
        code === '55P03' ||
        code === '57014' ||
        code.startsWith('57P'));
}
export function classifyExecutionError(err, catalogs, isTransientCode = isPostgresTransientSqlState) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const obj = err && typeof err === 'object' ? err : null;
    if (obj?.transient === true || obj?.retryable === true) {
        return {
            category: 'TRANSIENT',
            errorCode: typeof obj.code === 'string' ? obj.code : 'TRANSIENT_ERROR',
            errorMessage,
        };
    }
    if (obj?.permanent === true || obj?.retryable === false) {
        return {
            category: 'PERMANENT',
            errorCode: typeof obj.code === 'string' ? obj.code : 'PERMANENT_ERROR',
            errorMessage,
        };
    }
    if (err instanceof AppError) {
        if (err.code === 'COMMON-503-UNAVAILABLE' ||
            err.code === 'COMMON-504-TIMEOUT' ||
            err.code === 'COMMON-429-RATE_LIMITED') {
            return { category: 'TRANSIENT', errorCode: err.code, errorMessage };
        }
        if (/^COMMON-4\d\d-/.test(err.code)) {
            return { category: 'PERMANENT', errorCode: err.code, errorMessage };
        }
    }
    const rawCode = typeof obj?.code === 'string' ? obj.code : undefined;
    const constraint = typeof obj?.constraint === 'string' ? obj.constraint : undefined;
    if (rawCode) {
        if (TRANSIENT_NETWORK_CODES.has(rawCode)) {
            return { category: 'TRANSIENT', errorCode: rawCode, errorMessage };
        }
        if (isTransientCode(rawCode)) {
            return { category: 'TRANSIENT', errorCode: rawCode, errorMessage };
        }
        const rule = catalogs.dbErrors.resolve(rawCode, constraint);
        if (rule?.retryable === true) {
            return { category: 'TRANSIENT', errorCode: rule.code, errorMessage };
        }
        if (rawCode.startsWith('22') ||
            rawCode.startsWith('23') ||
            rawCode.startsWith('42') ||
            rawCode === 'P0002' ||
            rawCode.startsWith('ZG4')) {
            return { category: 'PERMANENT', errorCode: rule?.code ?? rawCode, errorMessage };
        }
    }
    return {
        category: 'UNKNOWN',
        errorCode: rawCode ?? (err instanceof AppError ? err.code : 'HANDLER_ERROR'),
        errorMessage,
    };
}
