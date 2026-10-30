export interface Identity {
    readonly accountId: string;
    readonly tenantId: number | null;
    readonly sessionId: string | null;
    readonly tokenId: string;
    readonly correlationId: string;
    readonly ip: string | null;
    readonly userAgent: string | null;
    readonly claims?: TokenClaims;
    readonly revocationDeferred?: boolean;
}
export interface TokenClaims {
    readonly sub: string;
    readonly jti: string;
    readonly sid: string | null;
    readonly tid: number | null;
    readonly iat: number;
    readonly exp: number;
    /** Roles granted by the token issuer; claim-based authorization reads only these. */
    readonly roles?: readonly string[];
}
export interface RevocationState {
    readonly tokenRevoked: boolean;
    readonly sessionRevoked: boolean;
    readonly accountDisabled: boolean;
    readonly tokensValidAfterSec: number | null;
}
export interface RevocationSource<Tx = unknown> {
    load(claims: TokenClaims, signal: AbortSignal, tx?: Tx): Promise<RevocationState>;
}
