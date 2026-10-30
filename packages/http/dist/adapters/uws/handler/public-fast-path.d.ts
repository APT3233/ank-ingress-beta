import type { Reply } from '@ank-ingress/contracts';
import type { RequestCtx } from '../request-ctx.js';
import type { RouteHandlerEnv } from './route-env.js';
export declare function failPublic(env: RouteHandlerEnv, ctx: RequestCtx, error: unknown): void;
/** `corked` is true when called synchronously from the uWS route callback (uWS already corked the socket). */
export declare function completePublic(env: RouteHandlerEnv, ctx: RequestCtx, reply: Reply, corked: boolean): void;
/**
 * Public routes without body, auth, audit or rate limit. Actual returned values determine sync/async
 * completion; no source prediction or Reply-construction side channel. Both views are immutable for public work.
 */
export declare function runPublicRoute(env: RouteHandlerEnv, ctx: RequestCtx): void;
