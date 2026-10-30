import type { Readable } from 'node:stream';
/** Header values; an array writes one header line per item (e.g. several `set-cookie`). */
export type ReplyHeaders = Readonly<Record<string, string | readonly string[]>>;
export type JsonReply = {
    readonly kind: 'json';
    readonly status?: number;
    readonly data: unknown;
    readonly headers?: ReplyHeaders;
};
export type TextReply = {
    readonly kind: 'text';
    readonly status?: number;
    readonly body: string;
    readonly contentType: string;
    readonly headers?: ReplyHeaders;
};
export type StreamReply = {
    readonly kind: 'stream';
    readonly status?: number;
    readonly body: Readable;
    readonly size?: number;
    readonly contentType: string;
    readonly headers?: ReplyHeaders;
};
export type RedirectStatus = 301 | 302 | 303 | 307 | 308;
export type EmptyReply = {
    readonly kind: 'empty';
    readonly status: 204 | 202 | RedirectStatus;
    readonly headers?: ReplyHeaders;
};
export type Reply = JsonReply | TextReply | StreamReply | EmptyReply;
export interface FileReplyOptions {
    /** Resolve `path` inside this directory and refuse paths that escape it; otherwise `path` must be absolute. */
    readonly root?: string;
    /** Send `Content-Disposition: attachment`; a string overrides the file name. */
    readonly download?: boolean | string;
    /** Defaults to a type guessed from the extension, else `application/octet-stream`. */
    readonly contentType?: string;
    readonly status?: number;
    readonly headers?: ReplyHeaders;
}
