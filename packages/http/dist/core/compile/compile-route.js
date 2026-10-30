import { CompositionError } from '@ank-ingress/kernel';
import { parseQueryString } from "./query-string.js";
import { compileBodyValidator, compileResponseSerializer, compileStringMapValidator } from "./schema-validators.js";
export function compileRoute(spec, deps) {
    const paramNames = [];
    for (const seg of spec.path.slice(1).split('/')) {
        if (seg.startsWith(':')) {
            paramNames.push(seg.slice(1));
        }
    }
    const needsAuth = spec.access.kind !== 'public';
    const needsBody = spec.body !== undefined || spec.method === 'POST' || spec.method === 'PUT' || spec.method === 'PATCH';
    const needsQuery = spec.query !== undefined;
    const needsIdempotencyHash = spec.idempotent !== undefined;
    const headerSet = new Set();
    if (deps.correlationHeader !== false)
        headerSet.add('x-correlation-id');
    if (deps.traceparent !== false)
        headerSet.add('traceparent');
    if (needsAuth) {
        headerSet.add('authorization');
        headerSet.add('x-tenant-id');
        headerSet.add('x-forwarded-for');
        headerSet.add('user-agent');
    }
    if (needsBody) {
        headerSet.add('content-type');
        headerSet.add('content-length');
    }
    if (spec.idempotent !== undefined) {
        headerSet.add('idempotency-key');
    }
    if (spec.cookies) {
        headerSet.add('cookie');
    }
    if (spec.hostInfo) {
        headerSet.add('host');
        headerSet.add('x-forwarded-proto');
        headerSet.add('x-forwarded-host');
    }
    if (spec.etag) {
        headerSet.add('if-none-match');
    }
    for (const h of spec.headers ?? []) {
        headerSet.add(h.toLowerCase());
    }
    const defaultTx = spec.access.kind === 'public' ? 'none' : spec.method === 'GET' ? 'read' : 'write';
    const tx = spec.tx ?? defaultTx;
    const responseKind = spec.responseKind ?? 'json';
    if (needsAuth && !deps.auth) {
        throw new CompositionError(`Route "${spec.method} ${spec.path}" requires authentication, but no auth stage is configured`);
    }
    let permissionSpec = null;
    if (spec.access.kind === 'permission') {
        permissionSpec = deps.catalogs.permissions.get(spec.access.code) ?? null;
        if (!permissionSpec) {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" references unknown permission "${spec.access.code}"`);
        }
        if (tx === 'none' && !deps.authorize && !deps.scope) {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" requires permission "${spec.access.code}" with tx: "none", but no authorize or scope stage is configured`);
        }
    }
    if (spec.rateLimit !== undefined && !deps.rateLimit) {
        throw new CompositionError(`Route "${spec.method} ${spec.path}" declares rateLimit, but no rateLimit store is configured`);
    }
    if (tx !== 'none' && !deps.scope) {
        throw new CompositionError(`Route "${spec.method} ${spec.path}" has tx: "${tx}", but no scope stage is configured`);
    }
    if (spec.audit !== undefined) {
        if (spec.access.kind === 'public') {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" cannot declare audit on a public route`);
        }
        if (!deps.onAudit) {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" declares audit metadata, but no onAudit hook is configured`);
        }
    }
    if (spec.idempotent !== undefined) {
        if (spec.access.kind === 'public') {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" cannot declare idempotent on a public route`);
        }
        if (tx !== 'write') {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" declares idempotent: "${spec.idempotent}", which requires tx: "write" (got "${tx}")`);
        }
        if (responseKind === 'stream') {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" cannot combine idempotent with responseKind: "stream"`);
        }
    }
    const paramsValidator = compileStringMapValidator(spec.params, true);
    const queryValidator = compileStringMapValidator(spec.query, false);
    const bodyFormat = spec.bodyFormat ?? 'json';
    const bodyValidator = bodyFormat === 'multipart'
        ? null
        : bodyFormat === 'urlencoded'
            ? compileStringMapValidator(spec.body, false)
            : compileBodyValidator(spec.body);
    const serializeResponse = responseKind === 'json' ? compileResponseSerializer(spec.response) : null;
    return {
        spec,
        method: spec.method,
        path: spec.path,
        tx,
        responseKind,
        bodyFormat,
        paramNames,
        headerNames: [...headerSet],
        needsBody,
        needsQuery,
        needsAuth,
        needsIdempotencyHash,
        timeoutMs: spec.timeoutMs ?? deps.defaultTimeoutMs,
        maxBodyBytes: spec.maxBodyBytes ?? deps.defaultMaxBodyBytes,
        permissionSpec,
        serializeResponse,
        validateParams(raw) {
            if (!paramsValidator)
                return raw;
            return paramsValidator(raw);
        },
        validateQuery(rawQuery) {
            const parsed = parseQueryString(rawQuery);
            if (!queryValidator)
                return parsed;
            return queryValidator(parsed);
        },
        validateBody(rawBody) {
            if (!bodyValidator)
                return rawBody;
            return bodyValidator(rawBody);
        },
    };
}
