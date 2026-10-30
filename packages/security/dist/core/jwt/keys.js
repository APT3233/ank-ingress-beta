import { createPrivateKey, createPublicKey } from 'node:crypto';
export const b64url = (data) => Buffer.from(data).toString('base64url');
export function parsePrivateKey(base64Pkcs8) {
    const key = createPrivateKey({
        key: Buffer.from(base64Pkcs8, 'base64'),
        format: 'der',
        type: 'pkcs8',
    });
    if (key.asymmetricKeyType !== 'ed25519') {
        throw new TypeError('JWT private key must be Ed25519');
    }
    return key;
}
export function parsePublicKey(rawPublicKey) {
    const trimmed = rawPublicKey.trim();
    if (!trimmed) {
        throw new TypeError('JWT public key must not be empty');
    }
    if (trimmed.startsWith('-----BEGIN')) {
        if (!trimmed.startsWith('-----BEGIN PUBLIC KEY-----')) {
            throw new TypeError('JWT public key PEM must be a PUBLIC KEY (not a private key)');
        }
    }
    const key = trimmed.startsWith('-----BEGIN PUBLIC KEY-----')
        ? createPublicKey(trimmed)
        : createPublicKey({
            key: Buffer.from(trimmed, 'base64'),
            format: 'der',
            type: 'spki',
        });
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
        throw new TypeError('JWT public key must be Ed25519');
    }
    return key;
}
export function parsePublicKeyMap(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
        throw new TypeError('JWT public key map must not be empty');
    }
    const out = new Map();
    if (trimmed.startsWith('{')) {
        let parsed;
        try {
            parsed = JSON.parse(trimmed);
        }
        catch {
            throw new TypeError('JWT public key map is not valid JSON');
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new TypeError('JWT public key map must be a JSON object of kid -> publicKey');
        }
        for (const [kid, val] of Object.entries(parsed)) {
            const cleanKid = kid.trim();
            if (!cleanKid || typeof val !== 'string' || !val.trim() || out.has(cleanKid)) {
                throw new TypeError(`Invalid or duplicate JWT public key entry for kid "${kid}"`);
            }
            out.set(cleanKid, parsePublicKey(val));
        }
    }
    else {
        for (const entry of trimmed.split(',')) {
            const item = entry.trim();
            if (!item)
                continue;
            const sep = item.indexOf(':');
            if (sep <= 0 || sep === item.length - 1) {
                throw new TypeError(`Invalid JWT public key entry "${item}" (expected kid:base64Spki)`);
            }
            const kid = item.slice(0, sep).trim();
            const rawKey = item.slice(sep + 1).trim();
            if (!kid || !rawKey || out.has(kid)) {
                throw new TypeError(`Invalid or duplicate kid "${kid}" in JWT public key map`);
            }
            out.set(kid, parsePublicKey(rawKey));
        }
    }
    if (out.size === 0) {
        throw new TypeError('JWT public key map must contain at least one key');
    }
    return out;
}
export function publicKeyBase64(privateKey) {
    return createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64');
}
