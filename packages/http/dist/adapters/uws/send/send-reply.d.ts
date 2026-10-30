import type { HttpResponse } from 'uWebSockets.js';
import type { Reply } from '@ank-ingress/contracts';
import type { Logger } from '@ank-ingress/observability';
import type { RequestCtx } from '../request-ctx.js';
export declare function sendReply(res: HttpResponse, ctx: RequestCtx, reply: Reply, isHead?: boolean, closeConnection?: boolean, logger?: Logger, serializer?: ((value: unknown) => string) | null): number | Promise<number>;
