export interface JwtSettings {
    readonly issuer: string;
    readonly audience: string;
    readonly accessTtlSeconds: number;
    readonly clockSkewSeconds?: number;
    readonly maxTokenBytes?: number;
    readonly maxCacheEntries?: number;
}
