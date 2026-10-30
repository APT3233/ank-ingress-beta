import { validationError } from "./errors/app-error.js";
export const QUANTITY = Object.freeze({ name: 'quantity', maxScale: 6, maxIntegerDigits: 14 });
export const COEFFICIENT = Object.freeze({ name: 'coefficient', maxScale: 15, maxIntegerDigits: 15 });
const FORMAT = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/;
export function parseDecimal(input, kind, options = {}) {
    const fail = (reason) => validationError([
        {
            ...(options.field === undefined ? {} : { field: options.field }),
            code: 'COMMON-422-INVALID_NUMBER',
            params: { reason, maxScale: kind.maxScale, maxIntegerDigits: kind.maxIntegerDigits },
        },
    ]);
    if (typeof input !== 'string')
        throw fail('NOT_A_STRING');
    const match = FORMAT.exec(input);
    if (!match)
        throw fail('FORMAT');
    const [, sign, integer, rawFraction = ''] = match;
    const fraction = rawFraction.replace(/0+$/, '');
    if (fraction.length > kind.maxScale)
        throw fail('SCALE');
    if (integer.length > kind.maxIntegerDigits)
        throw fail('MAGNITUDE');
    const isZero = integer === '0' && fraction === '';
    if (sign === '-' && !isZero && !options.allowNegative)
        throw fail('NEGATIVE');
    const normalized = (sign === '-' && !isZero ? '-' : '') + integer + (fraction ? `.${fraction}` : '');
    return normalized;
}
export function parseQuantity(input, options) {
    return parseDecimal(input, QUANTITY, options);
}
export function parseCoefficient(input, options) {
    return parseDecimal(input, COEFFICIENT, options);
}
