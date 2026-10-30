import { CompositionError } from '@ank-ingress/kernel';
const API_PATH_PREFIX = /^\/api\/v[1-9]\d*(\/|$)/;
const STATIC_SEGMENT = /^[a-z0-9][a-z0-9_-]*$/;
const PARAM_SEGMENT = /^:[a-zA-Z][a-zA-Z0-9_]*$/;
export function validateRoutePath(path) {
    if (!API_PATH_PREFIX.test(path)) {
        throw new CompositionError(`Route path must start with /api/v{n}/: "${path}"`);
    }
    if (path.endsWith('/') && path !== '/') {
        throw new CompositionError(`Route path must not have trailing slash: "${path}"`);
    }
    const segments = path.slice(1).split('/');
    const seenParams = new Set();
    for (let i = 2; i < segments.length; i++) {
        const seg = segments[i];
        if (PARAM_SEGMENT.test(seg)) {
            const paramName = seg.slice(1);
            if (seenParams.has(paramName)) {
                throw new CompositionError(`Duplicate route parameter ":${paramName}" in "${path}"`);
            }
            seenParams.add(paramName);
        }
        else if (!STATIC_SEGMENT.test(seg)) {
            throw new CompositionError(`Invalid route path segment "${seg}" in "${path}"`);
        }
    }
}
