/** cyrb53: fast non-cryptographic 53-bit string hash (no sync crypto on the hot path). */
function hash53(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export function weakEtag(payload) {
    return `W/"${payload.length.toString(16)}-${hash53(payload).toString(36)}"`;
}
/** Weak comparison per RFC 9110: `*` or any listed tag equal after dropping `W/`. */
export function ifNoneMatchHits(header, etag) {
    if (!header)
        return false;
    const opaque = etag.slice(2);
    for (const raw of header.split(',')) {
        const tag = raw.trim();
        if (tag === '*' || tag === etag || tag === opaque || (tag.startsWith('W/') && tag.slice(2) === opaque)) {
            return true;
        }
    }
    return false;
}
