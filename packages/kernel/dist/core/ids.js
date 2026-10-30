import { validationError } from "./errors/app-error.js";
const DIGITS = /^[1-9]\d*$/;
const INT_MAX = 2_147_483_647;
const BIGINT_MAX = 9223372036854775807n;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function invalid(field, code) {
    return validationError([{ ...(field === undefined ? {} : { field }), code }]);
}
export function parseIntId(input, field) {
    const text = typeof input === 'number' ? String(input) : input;
    if (typeof text !== 'string' || !DIGITS.test(text) || Number(text) > INT_MAX) {
        throw invalid(field, 'COMMON-422-INVALID_ID');
    }
    return Number(text);
}
export function parseBigIntId(input, field) {
    const text = typeof input === 'number' && Number.isSafeInteger(input) ? String(input) : input;
    if (typeof text !== 'string' || !DIGITS.test(text) || text.length > 19 || BigInt(text) > BIGINT_MAX) {
        throw invalid(field, 'COMMON-422-INVALID_ID');
    }
    return text;
}
export function parseUuid(input, field) {
    const text = typeof input === 'string' ? input.toLowerCase() : undefined;
    if (text === undefined || !UUID_RE.test(text)) {
        throw invalid(field, 'COMMON-422-INVALID_ID');
    }
    return text;
}
export function newUuid() {
    return globalThis.crypto.randomUUID();
}
