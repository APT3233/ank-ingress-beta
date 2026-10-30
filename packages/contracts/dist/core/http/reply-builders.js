const EMPTY_REPLY_STATUSES = new Set([204, 202, 301, 302, 303, 307, 308]);
export function isEmptyReplyStatus(status) {
    return EMPTY_REPLY_STATUSES.has(status);
}
/** `Content-Disposition: attachment` value with an ASCII fallback and an RFC 5987 UTF-8 file name. */
export function contentDisposition(filename) {
    const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
function withOptions(reply, options) {
    if (options === undefined)
        return reply;
    return {
        ...reply,
        ...(options.status === undefined ? {} : { status: options.status }),
        ...(options.headers === undefined ? {} : { headers: options.headers }),
    };
}
export function json(data, options) {
    const out = options === undefined
        ? { kind: 'json', data }
        : {
            kind: 'json',
            data,
            ...(options.status === undefined ? {} : { status: options.status }),
            ...(options.headers === undefined ? {} : { headers: options.headers }),
        };
    return out;
}
export function text(body, options) {
    return withOptions({ kind: 'text', body, contentType: options?.contentType ?? 'text/plain; charset=utf-8' }, options);
}
export function html(body, options) {
    return withOptions({ kind: 'text', body, contentType: 'text/html; charset=utf-8' }, options);
}
export function stream(body, options) {
    const out = {
        kind: 'stream',
        body,
        contentType: options.contentType,
        ...(options.size === undefined ? {} : { size: options.size }),
        ...(options.status === undefined ? {} : { status: options.status }),
        ...(options.headers === undefined ? {} : { headers: options.headers }),
    };
    return out;
}
export function empty(status = 204, headers) {
    const out = headers === undefined ? { kind: 'empty', status } : { kind: 'empty', status, headers };
    return out;
}
export function redirect(location, status = 302, headers) {
    if (location === '' || /[\r\n\0]/.test(location)) {
        throw new TypeError('Redirect location must be non-empty and must not contain CR, LF, or NUL');
    }
    return { kind: 'empty', status, headers: { ...headers, location } };
}
