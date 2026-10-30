export interface RateLimitRequest {
    readonly bucket: string;
    readonly subject: string;
    readonly limit: number;
    readonly windowMs: number;
}
export interface RateLimitDecision {
    readonly allowed: boolean;
    readonly remaining: number;
    readonly retryAfterMs: number;
}
/** Counter backend for route `rateLimit` (Redis in production, memory for a single process). */
export interface RateLimitStore {
    consume(request: RateLimitRequest): Promise<RateLimitDecision>;
}
