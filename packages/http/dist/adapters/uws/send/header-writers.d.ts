import type { HttpResponse } from 'uWebSockets.js';
import type { ReplyHeaders } from '@ank-ingress/contracts';
import type { RequestCtx } from '../request-ctx.js';
export declare const HEADER_CONTENT_TYPE = "content-type";
export declare const HEADER_CORRELATION_ID = "x-correlation-id";
/**
 * uWS writes `name: value\r\n` verbatim, so route-supplied header text must be checked before the
 * first write of a response; a throw then still leaves the response open for the error reply.
 */
export declare function assertHeaderValue(value: string): void;
export declare function assertHeaders(headers: ReplyHeaders): void;
export declare function writeHeaders(res: HttpResponse, headers: ReplyHeaders | undefined): void;
export declare function writeFlat(res: HttpResponse, flat: readonly string[], own: ReplyHeaders | undefined): void;
/** App-wide headers (security, CORS) yield to a reply header of the same name. */
export declare function writeDecor(res: HttpResponse, ctx: RequestCtx, own: ReplyHeaders | undefined): void;
