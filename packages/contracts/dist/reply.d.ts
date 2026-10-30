import { createFileReply } from './adapters/node-fs/file-reply.js';
import { empty, html, json, redirect, stream, text } from './core/http/reply-builders.js';
import type { Reply as ReplyShape } from './types/http/reply.types.js';
export type Reply = ReplyShape;
export declare const Reply: Readonly<{
    json: typeof json;
    text: typeof text;
    html: typeof html;
    stream: typeof stream;
    file: typeof createFileReply;
    empty: typeof empty;
    redirect: typeof redirect;
}>;
