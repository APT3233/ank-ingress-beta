import type { HttpResponse } from 'uWebSockets.js';
import type { CorsOptions } from '../../types/cors.types.js';
export interface CompiledCors {
    /** `Access-Control-Allow-Origin` value for this request origin, or null when it is not allowed. */
    allowOrigin(origin: string): string | null;
    /** Flat name/value pairs written after `Access-Control-Allow-Origin` on allowed responses. */
    readonly responseHeaders: readonly string[];
    /** `responseHeaders` as `\r\nname: value` lines, appended to the origin in one `writeHeader` call. */
    readonly responseSuffix: string;
    /** Writes a complete 204 preflight answer inside the caller's cork. */
    writePreflight(res: HttpResponse, origin: string, allowMethods: string): void;
}
export declare function compileCors(options: CorsOptions): CompiledCors;
