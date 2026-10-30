import type { HttpResponse } from 'uWebSockets.js';
import type { ReplyHeaders, TextReply } from '@ank-ingress/contracts';
import type { RequestCtx } from '../request-ctx.js';
export declare function sendEmpty(res: HttpResponse, ctx: RequestCtx, status: number, headers?: ReplyHeaders, closeConnection?: boolean): void;
export declare function sendText(res: HttpResponse, ctx: RequestCtx, reply: TextReply, isHead?: boolean, closeConnection?: boolean): number;
