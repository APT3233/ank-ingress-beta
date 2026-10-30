import type { HttpResponse } from 'uWebSockets.js';
import type { MultipartPart } from '@ank-ingress/contracts';
import type { RequestCtx } from './request-ctx.js';
export interface MultipartReaderLimits {
    readonly maxParts: number;
    readonly maxFieldBytes: number;
    readonly maxHeaderBytes: number;
}
export interface MultipartReader {
    parts(): AsyncIterableIterator<MultipartPart>;
    /** The whole body was received and parsed up to the closing boundary. */
    readonly finished: boolean;
    cancel(): void;
}
/**
 * Streams a multipart body without buffering it: the socket is paused until the handler iterates,
 * and paused again whenever the current part's stream is full (uWS `pause`/`resume` backpressure).
 * Must be started synchronously in the uWS route callback, like any body reader.
 */
export declare function startMultipartReader(res: HttpResponse, ctx: RequestCtx, maxBodyBytes: number, limits: MultipartReaderLimits): MultipartReader;
