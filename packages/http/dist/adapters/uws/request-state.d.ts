import type { HeaderBlock } from '../../core/headers/header-block.js';
import type { CompiledCors } from './cors-preflight.js';
export declare const STATE_OPEN = 0;
export declare const STATE_ABORTED = 1;
export declare const STATE_SENT = 2;
export type RequestState = typeof STATE_OPEN | typeof STATE_ABORTED | typeof STATE_SENT;
export declare const EMPTY_STRING_MAP: Record<string, string>;
export declare const EMPTY_HEADER_MAP: Record<string, string | undefined>;
/** App-wide response headers, compiled once: flat name/value pairs plus CORS. */
export interface ResponseDecor {
    /** Written on every route response (security headers), as flat pairs and as one joined block. */
    readonly base: readonly string[] | null;
    readonly baseBlock: HeaderBlock | null;
    readonly cors: CompiledCors | null;
}
export interface ClientIpTrust {
    readonly trustedProxies: ReadonlySet<string>;
    readonly trustUnixSocket: boolean;
}
