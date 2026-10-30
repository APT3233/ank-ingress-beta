import type { RevocationState, TokenClaims } from '@ank-ingress/contracts';
export declare function assertNotRevoked(claims: TokenClaims, state: RevocationState): void;
