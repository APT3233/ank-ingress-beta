import { CompositionError } from '@ank-ingress/kernel';
import { isHeaderName } from "./header-block.js";
export const DEFAULT_SECURITY_HEADERS = Object.freeze({
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': 'max-age=15552000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
});
export function compileSecurityHeaders(option) {
    if (option === false)
        return null;
    const out = { ...DEFAULT_SECURITY_HEADERS };
    if (option !== true) {
        for (const [rawName, value] of Object.entries(option)) {
            const name = rawName.toLowerCase();
            if (!isHeaderName(name)) {
                throw new CompositionError(`Invalid security header name "${rawName}"`);
            }
            if (value === false) {
                delete out[name];
            }
            else if (/[\r\n\0]/.test(value)) {
                throw new CompositionError(`Security header "${name}" must not contain CR, LF, or NUL`);
            }
            else {
                out[name] = value;
            }
        }
    }
    return Object.keys(out).length === 0 ? null : Object.freeze(out);
}
