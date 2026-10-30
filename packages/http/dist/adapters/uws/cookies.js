const EMPTY_COOKIES = Object.freeze({});
function decodeCookieValue(raw) {
    if (raw.length >= 2 && raw.charCodeAt(0) === 34 && raw.charCodeAt(raw.length - 1) === 34) {
        raw = raw.slice(1, -1);
    }
    if (raw.indexOf('%') === -1)
        return raw;
    try {
        return decodeURIComponent(raw);
    }
    catch {
        return raw;
    }
}
/** Parses a Cookie header; the first occurrence of a name wins. */
export function parseCookieHeader(header) {
    if (!header)
        return EMPTY_COOKIES;
    const out = Object.create(null);
    for (const pair of header.split(';')) {
        const eq = pair.indexOf('=');
        if (eq === -1)
            continue;
        const name = pair.slice(0, eq).trim();
        if (name === '' || name in out)
            continue;
        out[name] = decodeCookieValue(pair.slice(eq + 1).trim());
    }
    return out;
}
