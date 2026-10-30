export const SENSITIVE_KEYS = new Set([
    'password',
    'pass',
    'secret',
    'token',
    'accesstoken',
    'access_token',
    'refreshtoken',
    'refresh_token',
    'idtoken',
    'id_token',
    'authorization',
    'cookie',
    'set-cookie',
    'apikey',
    'api_key',
    'privatekey',
    'private_key',
    'signingkey',
    'signing_key',
    'clientsecret',
    'client_secret',
    'credential',
    'credentials',
    'connectionstring',
    'connection_string',
    'sqlparams',
    'sql_params',
    'rawparams',
    'raw_params',
    'queryparams',
    'query_params',
]);
export function isSensitiveKey(k) {
    if (k.length < 4)
        return false;
    return SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(k.toLowerCase());
}
export function sanitizeLogValue(value, depth = 0) {
    if (depth > 6 || value === null || value === undefined || typeof value !== 'object') {
        return value;
    }
    if (value instanceof Error) {
        return value;
    }
    if (Array.isArray(value)) {
        let changed = false;
        const len = value.length;
        const copy = new Array(len);
        for (let i = 0; i < len; i++) {
            const item = value[i];
            const s = item !== null && typeof item === 'object' ? sanitizeLogValue(item, depth + 1) : item;
            if (s !== item)
                changed = true;
            copy[i] = s;
        }
        return changed ? copy : value;
    }
    const obj = value;
    let out = null;
    for (const k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k))
            continue;
        const v = obj[k];
        if (isSensitiveKey(k)) {
            if (out === null)
                out = { ...obj };
            out[k] = '[REDACTED]';
        }
        else if (v !== null && typeof v === 'object') {
            const nested = sanitizeLogValue(v, depth + 1);
            if (nested !== v) {
                if (out === null)
                    out = { ...obj };
                out[k] = nested;
            }
        }
    }
    return out ?? obj;
}
