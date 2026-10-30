export function normalizeKafkaHeaders(raw) {
    const out = {};
    if (!raw)
        return out;
    if (Array.isArray(raw)) {
        for (const entry of raw) {
            if (!entry || typeof entry !== 'object')
                continue;
            for (const [k, v] of Object.entries(entry)) {
                if (v === undefined)
                    continue;
                out[k.toLowerCase()] = Buffer.isBuffer(v) ? v.toString('utf8') : String(v);
            }
        }
        return out;
    }
    for (const [k, v] of Object.entries(raw)) {
        if (v === undefined)
            continue;
        const item = Array.isArray(v) ? v[0] : v;
        if (item === undefined)
            continue;
        out[k.toLowerCase()] = Buffer.isBuffer(item) ? item.toString('utf8') : String(item);
    }
    return out;
}
