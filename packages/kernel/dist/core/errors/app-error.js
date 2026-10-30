import { CATEGORY_BY_STATUS, CODE_FORMAT } from "./error-code.js";
export class AppError extends Error {
    code;
    httpStatus;
    category;
    details;
    params;
    constructor(code, options = {}) {
        const match = CODE_FORMAT.exec(code);
        const status = match ? Number(match[1]) : NaN;
        const category = CATEGORY_BY_STATUS[status];
        if (category === undefined) {
            throw new TypeError(`Invalid error code format (expected <GROUP>-<HTTP>-<REASON>): ${code}`);
        }
        super(options.message ?? code, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'AppError';
        this.code = code;
        this.httpStatus = status;
        this.category = category;
        this.details = Object.freeze((options.details ?? []).map((detail) => Object.freeze({
            ...detail,
            ...(detail.params === undefined ? {} : { params: Object.freeze({ ...detail.params }) }),
        })));
        this.params = Object.freeze({ ...options.params });
    }
}
export function isAppError(value) {
    return value instanceof AppError;
}
export function validationError(details, message) {
    return new AppError('COMMON-422-VALIDATION', {
        details,
        message: message ?? 'Validation failed',
    });
}
