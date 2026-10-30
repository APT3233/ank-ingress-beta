import { createHash } from 'node:crypto';
import { AppError } from '@ank-ingress/kernel';
import { canonicalizeQuery } from "./query-string.js";
export function checkIdempotencyHeader(mode, headerValue) {
    if (!mode)
        return null;
    if (!headerValue || headerValue.trim() === '') {
        if (mode === 'required') {
            throw new AppError('COMMON-400-IDEMPOTENCY_KEY_REQUIRED', {
                message: 'Idempotency-Key header is required for this command',
            });
        }
        return null;
    }
    const trimmed = headerValue.trim();
    if (trimmed.length < 8 || trimmed.length > 128) {
        throw new AppError('COMMON-422-VALIDATION', {
            details: [{ field: 'Idempotency-Key', code: 'COMMON-422-INVALID_IDEMPOTENCY_KEY' }],
        });
    }
    return trimmed;
}
export function computeIdempotencyRequestHash(method, concretePath, rawQuery, rawBody) {
    const canonQuery = canonicalizeQuery(rawQuery);
    const h = createHash('sha256');
    h.update(method);
    h.update(' ');
    h.update(concretePath);
    h.update('?');
    h.update(canonQuery);
    h.update('\n');
    h.update(rawBody);
    return h.digest('hex');
}
