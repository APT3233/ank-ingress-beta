import net from 'node:net';
const UWS_IPV4_MAPPED_HEX = /^0000:0000:0000:0000:0000:ffff:([0-9a-f]{4}):([0-9a-f]{4})$/i;
const UWS_IPV6_LOOPBACK = /^0000:0000:0000:0000:0000:0000:0000:0001$/i;
export function normalizeIp(raw) {
    if (!raw)
        return null;
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    const hexMatch = UWS_IPV4_MAPPED_HEX.exec(trimmed);
    if (hexMatch) {
        const hi = parseInt(hexMatch[1], 16);
        const lo = parseInt(hexMatch[2], 16);
        return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
    if (UWS_IPV6_LOOPBACK.test(trimmed)) {
        return '::1';
    }
    if (trimmed.toLowerCase().startsWith('::ffff:')) {
        const v4 = trimmed.slice(7);
        if (net.isIP(v4) === 4) {
            return v4;
        }
    }
    if (net.isIP(trimmed) === 0) {
        return null;
    }
    return trimmed.toLowerCase();
}
export function resolveClientIp(remoteAddress, xffHeader, trustedProxies, trustUnixSocket) {
    const peerIp = normalizeIp(remoteAddress);
    const isTrustedIngress = peerIp === null ? trustUnixSocket : trustedProxies.has(peerIp);
    if (!isTrustedIngress || !xffHeader) {
        return peerIp;
    }
    const rawParts = xffHeader.split(',');
    let lastValidTrusted = peerIp;
    for (let i = rawParts.length - 1; i >= 0; i--) {
        const candidate = normalizeIp(rawParts[i]);
        if (candidate === null) {
            return lastValidTrusted;
        }
        if (!trustedProxies.has(candidate)) {
            return candidate;
        }
        lastValidTrusted = candidate;
    }
    return lastValidTrusted;
}
/** Whether X-Forwarded-* headers from this peer may be believed. */
export function isTrustedPeer(remoteAddress, trustedProxies, trustUnixSocket) {
    const peerIp = normalizeIp(remoteAddress);
    return peerIp === null ? trustUnixSocket : trustedProxies.has(peerIp);
}
