import type { HttpResponse } from 'uWebSockets.js';
import type { JsonReply, TextReply } from '@ank-ingress/contracts';
import type { Logger } from '@ank-ingress/observability';
import type { RequestCtx } from '../request-ctx.js';
/** `sendJson` for `etag: true` routes; chosen per route at compile time so other routes pay nothing. */
export declare function sendJsonWithEtag(res: HttpResponse, ctx: RequestCtx, reply: JsonReply, isHead: boolean, logger: Logger | undefined, serializer: ((value: unknown) => string) | null): number;
export declare function sendTextWithEtag(res: HttpResponse, ctx: RequestCtx, reply: TextReply, isHead: boolean): number;
