import { AppError, isAppError } from '@ank-ingress/kernel';
const DEFAULT_SQLSTATE_MAP = {
    '57014': { code: 'COMMON-503-UNAVAILABLE', retryable: false },
    '55P03': { code: 'COMMON-503-UNAVAILABLE', retryable: true },
    '53300': { code: 'COMMON-503-UNAVAILABLE', retryable: true },
    '40001': { code: 'COMMON-503-UNAVAILABLE', retryable: true },
    '40P01': { code: 'COMMON-503-UNAVAILABLE', retryable: true },
    '08006': { code: 'COMMON-503-UNAVAILABLE', retryable: true },
    '08003': { code: 'COMMON-503-UNAVAILABLE', retryable: true },
    '23505': { code: 'COMMON-409-CONFLICT', retryable: false },
    '23503': { code: 'COMMON-409-CONFLICT', retryable: false },
    '23514': { code: 'COMMON-422-VALIDATION', retryable: false },
    '23502': { code: 'COMMON-422-VALIDATION', retryable: false },
    '22P02': { code: 'COMMON-422-VALIDATION', retryable: false },
    '42501': { code: 'COMMON-403-FORBIDDEN', retryable: false },
};
export function classifyDbError(err, catalogs) {
    if (isAppError(err)) {
        return { appError: err, retryable: false };
    }
    const pgErr = err;
    const sqlstate = typeof pgErr?.code === 'string' ? pgErr.code : undefined;
    const constraint = typeof pgErr?.constraint === 'string' ? pgErr.constraint : undefined;
    const catalogRule = catalogs?.dbErrors.resolve(sqlstate, constraint);
    if (catalogRule) {
        return {
            appError: new AppError(catalogRule.code, {
                message: pgErr?.message ?? catalogRule.code,
                cause: err,
            }),
            retryable: catalogRule.retryable ?? false,
        };
    }
    if (sqlstate && DEFAULT_SQLSTATE_MAP[sqlstate]) {
        const def = DEFAULT_SQLSTATE_MAP[sqlstate];
        return {
            appError: new AppError(def.code, {
                message: pgErr?.message ?? def.code,
                cause: err,
            }),
            retryable: def.retryable ?? false,
        };
    }
    return {
        appError: new AppError('COMMON-500-INTERNAL', {
            message: pgErr?.message ?? 'Database error',
            cause: err,
        }),
        retryable: false,
    };
}
export function toAppError(err, catalogs) {
    return classifyDbError(err, catalogs).appError;
}
