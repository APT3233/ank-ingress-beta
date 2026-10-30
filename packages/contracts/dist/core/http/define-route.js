import { CompositionError } from '@ank-ingress/kernel';
import { PERMISSION_CODE_FORMAT } from "../catalog/catalog-formats.js";
import { validateRoutePath } from "./route-path.js";
export function defineRoute(spec) {
    validateRoutePath(spec.path);
    if (spec.access.kind === 'permission' && !PERMISSION_CODE_FORMAT.test(spec.access.code)) {
        throw new CompositionError(`Route "${spec.method} ${spec.path}" has invalid permission code "${spec.access.code}" (expected a:b(:c)*)`);
    }
    const defaultTx = spec.access.kind === 'public' ? 'none' : spec.method === 'GET' ? 'read' : 'write';
    const tx = spec.tx ?? defaultTx;
    const responseKind = spec.responseKind ?? 'json';
    if (spec.etag && spec.method !== 'GET') {
        throw new CompositionError(`Route "${spec.method} ${spec.path}" can only declare etag on GET`);
    }
    if (spec.rateLimit !== undefined) {
        const { limit, windowMs, key } = spec.rateLimit;
        if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" rateLimit needs positive integer limit and windowMs`);
        }
        if (key === 'identity' && spec.access.kind === 'public') {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" cannot rate-limit by identity on a public route`);
        }
    }
    if (spec.bodyFormat === 'multipart') {
        if (spec.body !== undefined) {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" streams multipart parts and cannot declare a body schema`);
        }
        if (spec.method !== 'POST' && spec.method !== 'PUT' && spec.method !== 'PATCH') {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" can only accept multipart on POST, PUT, or PATCH`);
        }
        if (tx !== 'none') {
            throw new CompositionError(`Route "${spec.method} ${spec.path}" streams multipart, which requires tx: "none" so no transaction stays open during the upload`);
        }
    }
    else if (spec.multipart !== undefined) {
        throw new CompositionError(`Route "${spec.method} ${spec.path}" sets multipart limits without bodyFormat: "multipart"`);
    }
    else if (spec.bodyFormat !== undefined && spec.body === undefined) {
        throw new CompositionError(`Route "${spec.method} ${spec.path}" declares bodyFormat: "${spec.bodyFormat}" without a body schema`);
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
    if (spec.audit !== undefined && spec.access.kind === 'public') {
        throw new CompositionError(`Route "${spec.method} ${spec.path}" cannot declare audit on a public route`);
    }
    return Object.freeze({
        ...spec,
        tx: tx,
        responseKind,
    });
}
