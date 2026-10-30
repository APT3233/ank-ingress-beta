export function toRdKafkaHeaders(headers) {
    if (!headers)
        return undefined;
    const out = [];
    for (const [k, v] of Object.entries(headers)) {
        if (v === undefined)
            continue;
        if (k.includes('\u0000'))
            throw new Error('Kafka header names cannot contain NUL');
        out.push({ [k]: typeof v === 'string' ? Buffer.from(v, 'utf8') : v });
    }
    return out.length > 0 ? out : undefined;
}
export function fromRdKafkaHeaders(raw) {
    const out = {};
    if (!Array.isArray(raw))
        return out;
    for (const item of raw) {
        if (!item || typeof item !== 'object')
            continue;
        for (const [k, v] of Object.entries(item)) {
            out[k] = v;
        }
    }
    return out;
}
