import type { HttpResponse } from 'uWebSockets.js';
import type { BodyCollector } from '../body-collector.js';
import type { MultipartReader } from '../multipart-reader.js';
import type { RequestCtx } from '../request-ctx.js';
import type { RouteHandlerEnv } from './route-env.js';
/** Non-public routes: schedules the deadline, then runs auth, rate limit, body, scope and reply in the request log scope. */
export declare function startRouteExecution(env: RouteHandlerEnv, res: HttpResponse, ctx: RequestCtx, bodyCollector: BodyCollector | null, multipart: MultipartReader | null): void;
