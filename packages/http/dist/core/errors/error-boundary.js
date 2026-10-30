import { Reply } from '@ank-ingress/contracts';
import { AppError, isAppError } from '@ank-ingress/kernel';
export function toReply(err, catalogs, correlationId, logger) {
    const appErr = isAppError(err)
        ? err
        : new AppError('COMMON-500-INTERNAL', {
            message: err instanceof Error ? err.message : 'Unhandled error',
            cause: err,
        });
    if (appErr.httpStatus >= 500) {
        logger?.error('http.error', {
            code: appErr.code,
            status: appErr.httpStatus,
            detail: appErr.message,
        });
    }
    const publicMessage = catalogs.errors.has(appErr.code)
        ? catalogs.errors.message(appErr.code)
        : appErr.httpStatus === 422
            ? 'Validation failed'
            : appErr.httpStatus === 404
                ? 'Not found'
                : appErr.httpStatus === 401
                    ? 'Unauthenticated'
                    : appErr.httpStatus === 403
                        ? 'Forbidden'
                        : appErr.httpStatus === 409
                            ? 'Conflict'
                            : appErr.httpStatus === 413
                                ? 'Payload too large'
                                : appErr.httpStatus === 415
                                    ? 'Unsupported media type'
                                    : appErr.httpStatus === 429
                                        ? 'Too many requests'
                                        : appErr.httpStatus === 503
                                            ? 'Service unavailable'
                                            : catalogs.errors.message('COMMON-500-INTERNAL');
    const body = {
        code: appErr.code,
        message: publicMessage,
        correlationId,
        ...(appErr.details.length > 0 ? { details: appErr.details } : {}),
        ...(Object.keys(appErr.params).length > 0 ? { params: appErr.params } : {}),
    };
    const retryAfter = appErr.params.retryAfterSeconds;
    const headers = appErr.httpStatus === 503 || appErr.httpStatus === 429
        ? { 'retry-after': typeof retryAfter === 'number' ? String(retryAfter) : '1' }
        : appErr.httpStatus === 413
            ? { connection: 'close' }
            : undefined;
    return Reply.json(body, {
        status: appErr.httpStatus,
        ...(headers ? { headers } : {}),
    });
}
