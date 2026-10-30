export const CODE_FORMAT = /^[A-Z][A-Z0-9]*-(\d{3})-[A-Z0-9_]+$/;
export const CATEGORY_BY_STATUS = {
    400: 'VALIDATION',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'VALIDATION',
    409: 'CONFLICT',
    413: 'PAYLOAD',
    415: 'PAYLOAD',
    422: 'VALIDATION',
    423: 'LOCKED',
    429: 'RATE_LIMITED',
    500: 'INTERNAL',
    503: 'UNAVAILABLE',
};
export function isValidErrorCodeFormat(code) {
    const match = CODE_FORMAT.exec(code);
    if (!match)
        return false;
    return CATEGORY_BY_STATUS[Number(match[1])] !== undefined;
}
