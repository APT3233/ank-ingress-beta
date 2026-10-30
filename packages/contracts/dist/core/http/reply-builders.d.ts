import type { Readable } from 'node:stream';
import type { EmptyReply, JsonReply, RedirectStatus, ReplyHeaders, StreamReply, TextReply } from '../../types/http/reply.types.js';
export declare function isEmptyReplyStatus(status: number): status is EmptyReply['status'];
/** `Content-Disposition: attachment` value with an ASCII fallback and an RFC 5987 UTF-8 file name. */
export declare function contentDisposition(filename: string): string;
type BasicOptions = {
    readonly status?: number;
    readonly headers?: ReplyHeaders;
};
export declare function json(data: unknown, options?: BasicOptions): JsonReply;
export declare function text(body: string, options?: BasicOptions & {
    readonly contentType?: string;
}): TextReply;
export declare function html(body: string, options?: BasicOptions): TextReply;
export declare function stream(body: Readable, options: BasicOptions & {
    readonly contentType: string;
    readonly size?: number;
}): StreamReply;
export declare function empty(status?: 204 | 202, headers?: ReplyHeaders): EmptyReply;
export declare function redirect(location: string, status?: RedirectStatus, headers?: ReplyHeaders): EmptyReply;
export {};
