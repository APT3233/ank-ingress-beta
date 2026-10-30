import type { CorsOptions } from '../../types/cors.types.js';
/** Origin check and header lists compiled once from `CorsOptions`. */
export interface CorsPolicy {
    /** `Access-Control-Allow-Origin` value for this request origin, or null when it is not allowed. */
    readonly allowOrigin: (origin: string) => string | null;
    /** Flat name/value pairs written after `Access-Control-Allow-Origin` on allowed responses. */
    readonly responseHeaders: readonly string[];
    /** `responseHeaders` as `\r\nname: value` lines, appended to the origin in one `writeHeader` call. */
    readonly responseSuffix: string;
    /** Flat name/value pairs written on an allowed preflight answer. */
    readonly preflightHeaders: readonly string[];
}
export declare const PREFLIGHT_VARY = "Origin, Access-Control-Request-Method, Access-Control-Request-Headers";
export declare function compileCorsPolicy(options: CorsOptions): CorsPolicy;
