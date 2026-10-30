export const HEADER_CONTENT_TYPE = 'content-type';
export const HEADER_CORRELATION_ID = 'x-correlation-id';
const HEADER_NAME_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HEADER_VALUE_FORBIDDEN = /[\r\n\0]/;
/**
 * uWS writes `name: value\r\n` verbatim, so route-supplied header text must be checked before the
 * first write of a response; a throw then still leaves the response open for the error reply.
 */
export function assertHeaderValue(value) {
    if (HEADER_VALUE_FORBIDDEN.test(value))
        throw new Error('Response header value contains CR, LF or NUL');
}
export function assertHeaders(headers) {
    for (const k in headers) {
        if (!HEADER_NAME_TOKEN.test(k))
            throw new Error('Response header name is not a valid token');
        const v = headers[k];
        if (typeof v === 'string') {
            assertHeaderValue(v);
        }
        else {
            for (let i = 0; i < v.length; i++)
                assertHeaderValue(v[i]);
        }
    }
}
export function writeHeaders(res, headers) {
    if (headers === undefined)
        return;
    for (const k in headers) {
        const v = headers[k];
        if (typeof v === 'string') {
            res.writeHeader(k, v);
        }
        else {
            for (let i = 0; i < v.length; i++)
                res.writeHeader(k, v[i]);
        }
    }
}
export function writeFlat(res, flat, own) {
    for (let i = 0; i < flat.length; i += 2) {
        const k = flat[i];
        if (own !== undefined && k in own)
            continue;
        res.writeHeader(k, flat[i + 1]);
    }
}
/** App-wide headers (security, CORS) yield to a reply header of the same name. */
export function writeDecor(res, ctx, own) {
    const decor = ctx.decor;
    if (decor === null)
        return;
    const origin = ctx.corsOrigin;
    if (own === undefined) {
        // One native call per block instead of one per header.
        if (decor.baseBlock !== null)
            res.writeHeader(decor.baseBlock.name, decor.baseBlock.value);
        if (origin !== null && decor.cors !== null) {
            res.writeHeader('access-control-allow-origin', origin + decor.cors.responseSuffix);
        }
        return;
    }
    if (decor.base !== null)
        writeFlat(res, decor.base, own);
    if (origin !== null && decor.cors !== null) {
        if (own === undefined || !('access-control-allow-origin' in own)) {
            res.writeHeader('access-control-allow-origin', origin);
        }
        writeFlat(res, decor.cors.responseHeaders, own);
    }
}
