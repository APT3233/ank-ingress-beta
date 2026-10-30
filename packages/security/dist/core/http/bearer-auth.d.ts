import type { Identity } from '@ank-ingress/contracts';
import type { JwtVerifier } from '../jwt/jwt-verifier.js';
import type { RevocationCache } from '../../types/revocation.types.js';
export interface BearerAuthOptions {
    readonly verifier: JwtVerifier;
    readonly revocation: Pick<RevocationCache, 'check'> & Partial<Pick<RevocationCache, 'checkCached'>>;
}
export interface BearerAuthInput {
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly correlationId: string;
    readonly ip: string | null;
    readonly userAgent: string | null;
    readonly signal: AbortSignal;
    readonly deferRevocationToTx?: boolean;
}
export declare function bearerAuth(options: BearerAuthOptions): (input: BearerAuthInput) => Promise<Identity>;
