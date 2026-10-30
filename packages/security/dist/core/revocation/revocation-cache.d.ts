import type { RevocationCache, RevocationCacheOptions } from '../../types/revocation.types.js';
export declare function createRevocationCache<Tx = unknown>(options: RevocationCacheOptions<Tx>): RevocationCache<Tx>;
