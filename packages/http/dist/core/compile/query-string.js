function decodeQueryPart(raw) {
    if (raw.indexOf('%') === -1 && raw.indexOf('+') === -1) {
        return raw;
    }
    const plusReplaced = raw.indexOf('+') !== -1 ? raw.replaceAll('+', ' ') : raw;
    try {
        return decodeURIComponent(plusReplaced);
    }
    catch {
        return plusReplaced;
    }
}
export function parseQueryString(rawQuery) {
    const out = {};
    const len = rawQuery.length;
    if (len === 0)
        return out;
    let start = 0;
    while (start < len) {
        let amp = rawQuery.indexOf('&', start);
        if (amp === -1)
            amp = len;
        if (amp > start) {
            const eq = rawQuery.indexOf('=', start);
            if (eq === -1 || eq >= amp) {
                const k = decodeQueryPart(rawQuery.slice(start, amp));
                out[k] = '';
            }
            else {
                const k = decodeQueryPart(rawQuery.slice(start, eq));
                const v = decodeQueryPart(rawQuery.slice(eq + 1, amp));
                out[k] = v;
            }
        }
        start = amp + 1;
    }
    return out;
}
export function canonicalizeQuery(rawQuery) {
    if (!rawQuery)
        return '';
    const params = new URLSearchParams(rawQuery);
    const entries = [...params.entries()];
    if (entries.length === 0)
        return '';
    entries.sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0));
    const sorted = new URLSearchParams(entries);
    return sorted.toString();
}
