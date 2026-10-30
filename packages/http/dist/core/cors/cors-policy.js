import { CompositionError } from '@ank-ingress/kernel';
import { headerLines, isHeaderName } from "../headers/header-block.js";
const DEFAULT_ALLOW_HEADERS = [
    'authorization',
    'content-type',
    'idempotency-key',
    'traceparent',
    'x-correlation-id',
    'x-tenant-id',
];
export const PREFLIGHT_VARY = 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers';
export function compileCorsPolicy(options) {
    const { origin, credentials = false } = options;
    const anyOrigin = origin === '*';
    if (anyOrigin && credentials) {
        throw new CompositionError('CORS origin "*" cannot be combined with credentials: true');
    }
    let isAllowed;
    if (typeof origin === 'function') {
        // Echoed origins are written verbatim, so never echo one carrying a line break.
        isAllowed = (value) => value.indexOf('\r') === -1 && value.indexOf('\n') === -1 && origin(value);
    }
    else if (anyOrigin) {
        isAllowed = () => true;
    }
    else {
        const list = typeof origin === 'string' ? [origin] : origin;
        for (const entry of list) {
            if (/[\r\n\0]/.test(entry))
                throw new CompositionError(`CORS origin "${entry}" must not contain CR, LF, or NUL`);
        }
        const allowed = new Set(list);
        isAllowed = (value) => allowed.has(value);
    }
    const expose = options.exposeHeaders ?? ['x-correlation-id'];
    for (const name of [...expose, ...(options.allowHeaders ?? [])]) {
        if (!isHeaderName(name))
            throw new CompositionError(`Invalid CORS header name "${name}"`);
    }
    const responseHeaders = [];
    if (credentials)
        responseHeaders.push('access-control-allow-credentials', 'true');
    if (expose.length > 0)
        responseHeaders.push('access-control-expose-headers', expose.join(', '));
    if (!anyOrigin)
        responseHeaders.push('vary', 'Origin');
    const preflightHeaders = [
        'vary',
        PREFLIGHT_VARY,
        'access-control-allow-headers',
        (options.allowHeaders ?? DEFAULT_ALLOW_HEADERS).join(', '),
    ];
    if (credentials)
        preflightHeaders.push('access-control-allow-credentials', 'true');
    if (options.maxAgeSeconds !== undefined) {
        preflightHeaders.push('access-control-max-age', String(options.maxAgeSeconds));
    }
    const allowOrigin = (value) => isAllowed(value) ? (anyOrigin ? '*' : value) : null;
    return {
        allowOrigin,
        responseHeaders: Object.freeze(responseHeaders),
        responseSuffix: headerLines(responseHeaders),
        preflightHeaders,
    };
}
