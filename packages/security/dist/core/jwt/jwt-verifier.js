import { verify } from 'node:crypto';
import { AppError, CompositionError, parseBigIntId, parseIntId, parseUuid } from '@ank-ingress/kernel';
const SEGMENT = /^[A-Za-z0-9_-]+$/;
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const unauthenticated = (reason) => new AppError('AUTH-401-SESSION_EXPIRED', { message: `Invalid JWT: ${reason}` });
export class JwtVerifier {
    keys;
    settings;
    maxTokenBytes;
    maxCacheEntries;
    cache = new Map();
    cacheHits = 0;
    cacheMisses = 0;
    constructor(publicKeys, settings) {
        this.maxTokenBytes = settings.maxTokenBytes ?? 8192;
        this.maxCacheEntries = settings.maxCacheEntries ?? 50_000;
        if (!Number.isSafeInteger(this.maxTokenBytes) || this.maxTokenBytes < 1) {
            throw new TypeError('maxTokenBytes must be a positive safe integer');
        }
        if (!settings.issuer?.trim() || !settings.audience?.trim()) {
            throw new CompositionError('JwtVerifier requires non-empty issuer and audience');
        }
        this.keys = new Map();
        this.settings = settings;
        this.updateKeys(publicKeys);
    }
    updateKeys(publicKeys) {
        if (publicKeys.size === 0) {
            throw new CompositionError('JwtVerifier requires at least one public key');
        }
        const next = new Map();
        for (const [kid, key] of publicKeys) {
            if (!kid.trim() || key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
                throw new CompositionError(`Invalid Ed25519 public key for kid "${kid}"`);
            }
            next.set(kid, key);
        }
        this.keys = next;
        this.cache.clear();
    }
    verify(token, nowSeconds = Math.floor(Date.now() / 1000)) {
        if (token.length > this.maxTokenBytes) {
            throw unauthenticated('token budget');
        }
        const skew = this.settings.clockSkewSeconds ?? 30;
        if (this.maxCacheEntries > 0) {
            const cached = this.cache.get(token);
            if (cached !== undefined) {
                if (cached.exp + skew > nowSeconds) {
                    this.cacheHits++;
                    // Refresh LRU order
                    this.cache.delete(token);
                    this.cache.set(token, cached);
                    return cached;
                }
                this.cache.delete(token);
            }
        }
        this.cacheMisses++;
        const parts = token.split('.');
        if (parts.length !== 3 || !parts.every((p) => SEGMENT.test(p))) {
            throw unauthenticated('format');
        }
        const [h, p, s] = parts;
        let header;
        let payload;
        try {
            header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
            payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
        }
        catch {
            throw unauthenticated('JSON');
        }
        if (!isRecord(header) || !isRecord(payload)) {
            throw unauthenticated('JSON object required');
        }
        if (header.alg !== 'EdDSA' || typeof header.kid !== 'string') {
            throw unauthenticated('alg/kid');
        }
        const key = this.keys.get(header.kid);
        if (key === undefined) {
            throw unauthenticated('unknown kid');
        }
        if (!verify(null, Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) {
            throw unauthenticated('signature');
        }
        if (payload.iss !== this.settings.issuer || payload.aud !== this.settings.audience) {
            throw unauthenticated('issuer/audience');
        }
        if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp + skew <= nowSeconds) {
            throw unauthenticated('expired');
        }
        if (typeof payload.iat !== 'number' ||
            !Number.isFinite(payload.iat) ||
            payload.iat - skew > nowSeconds ||
            payload.exp <= payload.iat) {
            throw unauthenticated('iat/exp');
        }
        if (typeof payload.sub !== 'string') {
            throw unauthenticated('sub');
        }
        const tid = payload.tid;
        if (!(tid === null || typeof tid === 'number')) {
            throw unauthenticated('tid');
        }
        const roles = payload.roles;
        if (roles !== undefined && !(Array.isArray(roles) && roles.every((r) => typeof r === 'string'))) {
            throw unauthenticated('roles');
        }
        let claims;
        try {
            claims = Object.freeze({
                sub: parseBigIntId(payload.sub),
                tid: tid === null ? null : parseIntId(tid),
                sid: payload.sid === null || payload.sid === undefined ? null : parseUuid(payload.sid),
                iat: payload.iat,
                exp: payload.exp,
                jti: parseUuid(payload.jti),
                ...(roles === undefined ? {} : { roles: Object.freeze([...roles]) }),
            });
        }
        catch {
            throw unauthenticated('identity claims');
        }
        if (this.maxCacheEntries > 0) {
            if (this.cache.size >= this.maxCacheEntries) {
                const oldestKey = this.cache.keys().next().value;
                if (oldestKey !== undefined) {
                    this.cache.delete(oldestKey);
                }
            }
            this.cache.set(token, claims);
        }
        return claims;
    }
    getStats() {
        const total = this.cacheHits + this.cacheMisses;
        return {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: total > 0 ? Number((this.cacheHits / total).toFixed(6)) : 0,
            size: this.cache.size,
            maxCacheEntries: this.maxCacheEntries,
        };
    }
    resetStats() {
        this.cacheHits = 0;
        this.cacheMisses = 0;
    }
}
