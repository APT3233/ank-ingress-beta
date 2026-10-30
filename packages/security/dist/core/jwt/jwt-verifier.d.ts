import { type KeyObject } from 'node:crypto';
import type { TokenClaims } from '@ank-ingress/contracts';
import type { JwtSettings } from '../../types/jwt.types.js';
export declare class JwtVerifier {
    private keys;
    private readonly settings;
    private readonly maxTokenBytes;
    private readonly maxCacheEntries;
    private readonly cache;
    private cacheHits;
    private cacheMisses;
    constructor(publicKeys: ReadonlyMap<string, KeyObject>, settings: JwtSettings);
    updateKeys(publicKeys: ReadonlyMap<string, KeyObject>): void;
    verify(token: string, nowSeconds?: number): TokenClaims;
    getStats(): {
        readonly hits: number;
        readonly misses: number;
        readonly hitRate: number;
        readonly size: number;
        readonly maxCacheEntries: number;
    };
    resetStats(): void;
}
