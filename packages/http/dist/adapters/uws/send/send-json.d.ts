import type { HttpResponse } from 'uWebSockets.js';
import type { ReplyHeaders } from '@ank-ingress/contracts';
import type { Logger } from '@ank-ingress/observability';
import type { RequestCtx } from '../request-ctx.js';
export declare function sendJson(res: HttpResponse, ctx: RequestCtx, status: number, data: unknown, headers?: ReplyHeaders, isHead?: boolean, closeConnection?: boolean, logger?: Logger, serializer?: ((value: unknown) => string) | null, 
/** True only in the synchronous top of a uWS route handler, where uWS has already corked the socket. */
corked?: boolean): number;
