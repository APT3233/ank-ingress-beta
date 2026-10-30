import { sign } from 'node:crypto';
import { b64url } from "./keys.js";
export class JwtSigner {
    kid;
    key;
    settings;
    encodedHeader;
    constructor(kid, privateKey, settings) {
        this.kid = kid;
        this.key = privateKey;
        this.settings = settings;
        this.encodedHeader = b64url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: this.kid }));
    }
    sign(claims, nowSeconds = Math.floor(Date.now() / 1000)) {
        const payload = b64url(JSON.stringify({
            ...claims,
            iss: this.settings.issuer,
            aud: this.settings.audience,
            iat: nowSeconds,
            exp: nowSeconds + this.settings.accessTtlSeconds,
            jti: claims.jti ?? globalThis.crypto.randomUUID(),
        }));
        const signingInput = `${this.encodedHeader}.${payload}`;
        const signature = sign(null, Buffer.from(signingInput), this.key);
        return `${signingInput}.${b64url(signature)}`;
    }
}
