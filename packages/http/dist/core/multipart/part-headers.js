import { AppError } from '@ank-ingress/kernel';
export function invalid(message) {
    return new AppError('COMMON-400-INVALID_MULTIPART', { message });
}
/** Splits `a=1; b="x;y"` style parameters, honouring quoted strings and backslash escapes. */
export function parseParams(value) {
    const out = new Map();
    let i = value.indexOf(';');
    while (i !== -1 && i < value.length) {
        i += 1;
        const eq = value.indexOf('=', i);
        if (eq === -1)
            break;
        const key = value.slice(i, eq).trim().toLowerCase();
        let j = eq + 1;
        while (value[j] === ' ' || value[j] === '\t')
            j++;
        let val = '';
        if (value[j] === '"') {
            j++;
            while (j < value.length && value[j] !== '"') {
                if (value[j] === '\\' && j + 1 < value.length)
                    j++;
                val += value[j];
                j++;
            }
            i = value.indexOf(';', j);
        }
        else {
            const end = value.indexOf(';', j);
            val = (end === -1 ? value.slice(j) : value.slice(j, end)).trim();
            i = end;
        }
        if (key !== '' && !out.has(key))
            out.set(key, val);
    }
    return out;
}
export function decodeExtValue(value) {
    const match = /^utf-8'[^']*'(.*)$/i.exec(value);
    if (!match)
        return null;
    try {
        return decodeURIComponent(match[1]);
    }
    catch {
        return null;
    }
}
export function parsePartHeaders(block) {
    let disposition = null;
    let contentType = null;
    for (const line of block.split('\r\n')) {
        const colon = line.indexOf(':');
        if (colon === -1)
            throw invalid('Malformed multipart part header');
        const name = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        if (name === 'content-disposition')
            disposition = value;
        else if (name === 'content-type')
            contentType = value;
    }
    if (disposition === null || !/^form-data\s*(;|$)/i.test(disposition)) {
        throw invalid('Multipart part needs Content-Disposition: form-data');
    }
    const params = parseParams(disposition);
    const name = params.get('name');
    if (name === undefined)
        throw invalid('Multipart part has no name');
    const extended = params.get('filename*');
    const filename = (extended === undefined ? null : decodeExtValue(extended)) ?? params.get('filename') ?? null;
    return {
        name,
        filename,
        contentType: contentType ?? (filename === null ? 'text/plain' : 'application/octet-stream'),
    };
}
