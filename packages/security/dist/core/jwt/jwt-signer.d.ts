import { type KeyObject } from 'node:crypto';
import type { TokenClaims } from '@ank-ingress/contracts';
import type { JwtSettings } from '../../types/jwt.types.js';
export declare class JwtSigner {
    private readonly kid;
    private readonly key;
    private readonly settings;
    private readonly encodedHeader;
    constructor(kid: string, privateKey: KeyObject, settings: JwtSettings);
    sign(claims: Omit<TokenClaims, 'iat' | 'exp' | 'jti'> & {
        readonly jti?: string;
    }, nowSeconds?: number): string;
}
