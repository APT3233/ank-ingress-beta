import { validationError } from "./errors/app-error.js";
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
function invalid(field, code) {
    return validationError([{ ...(field === undefined ? {} : { field }), code }]);
}
export function toIsoTimestamp(date) {
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
        throw new RangeError('Timestamp requires a valid Date in calendar years 0001..9999');
    }
    return date.toISOString();
}
function isCalendarDate(year, month, day) {
    if (year < 1 || year > 9999)
        return false;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function parseIsoTimestamp(input, field) {
    const match = typeof input === 'string' ? RFC3339.exec(input) : null;
    if (!match ||
        !isCalendarDate(Number(match[1]), Number(match[2]), Number(match[3])) ||
        Number(match[4]) > 23 ||
        Number(match[5]) > 59 ||
        Number(match[6]) > 59) {
        throw invalid(field, 'COMMON-422-INVALID_TIMESTAMP');
    }
    try {
        return toIsoTimestamp(new Date(input));
    }
    catch {
        throw invalid(field, 'COMMON-422-INVALID_TIMESTAMP');
    }
}
export function parseBusinessDate(input, field) {
    const match = typeof input === 'string' ? DATE.exec(input) : null;
    if (!match)
        throw invalid(field, 'COMMON-422-INVALID_DATE');
    const [, y, m, d] = match.map(Number);
    if (!isCalendarDate(y, m, d)) {
        throw invalid(field, 'COMMON-422-INVALID_DATE');
    }
    return input;
}
export function isTimeZone(timeZone) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone });
        return true;
    }
    catch {
        return false;
    }
}
export function businessDateInZone(instant, timeZone) {
    if (!isTimeZone(timeZone))
        throw new RangeError(`Invalid timeZone: ${timeZone}`);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        calendar: 'gregory',
        numberingSystem: 'latn',
        era: 'short',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(instant);
    const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
    const year = Number(get('year'));
    if (get('era') !== 'AD' || year < 1 || year > 9999) {
        throw new RangeError('Business date requires calendar years 0001..9999');
    }
    return `${String(year).padStart(4, '0')}-${get('month')}-${get('day')}`;
}
