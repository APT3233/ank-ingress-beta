import type { HttpResponse } from 'uWebSockets.js';
import type { StreamReply } from '@ank-ingress/contracts';
import type { RequestCtx } from '../request-ctx.js';
export declare function sendStream(res: HttpResponse, ctx: RequestCtx, reply: StreamReply, isHead?: boolean): Promise<void>;
