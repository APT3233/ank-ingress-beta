import type { RouteRateLimit } from '@ank-ingress/contracts';
import type { BoundCounter, BoundHistogram } from '@ank-ingress/observability';
import type { CompiledRoute } from '../../../types/compiled-route.types.js';
import type { CompiledCors } from '../cors-preflight.js';
import type { DeadlineLane } from '../deadline-wheel.js';
import type { MultipartReaderLimits } from '../multipart-reader.js';
import type { RequestCtx } from '../request-ctx.js';
import { type ResponseDecor } from '../request-state.js';
import type { TransportRuntimeState } from '../transport-state.js';
/** Everything `createUwsRouteHandler` computes once per route; built once and shared by every request. */
export interface RouteHandlerEnv {
    readonly compiled: CompiledRoute;
    readonly rt: TransportRuntimeState;
    readonly isHead: boolean;
    readonly paramNames: readonly string[];
    readonly headerNames: readonly string[];
    readonly serializeResponse: ((value: unknown) => string) | null;
    readonly paramLen: number;
    readonly headerLen: number;
    readonly operationName: string;
    readonly needUrlSnapshot: boolean;
    readonly publicNoBody: boolean;
    readonly readCorrelation: boolean;
    readonly readTraceparent: boolean;
    readonly hasDefaultHeadersOnly: boolean;
    readonly capturesNoHeaders: boolean;
    readonly capturesForwardedFor: boolean;
    readonly proxiesTrusted: boolean;
    readonly etag: boolean;
    readonly validatesBeforeHandler: boolean;
    readonly multipartLimits: MultipartReaderLimits | null;
    readonly rateLimit: RouteRateLimit | undefined;
    readonly rateLimitBucket: string;
    readonly rateLimitByIdentity: boolean;
    readonly rateLimitByIp: boolean;
    readonly enforceRateLimit: (subject: string) => Promise<void>;
    readonly decor: ResponseDecor | null;
    readonly decorEveryResponse: boolean;
    readonly cors: CompiledCors | null;
    readonly boundDuration: BoundHistogram | undefined;
    readonly statusSeries: Map<number, BoundCounter>;
    readonly boundStatus200: BoundCounter | undefined;
    readonly routeDeadlineLane: DeadlineLane<RequestCtx> | null;
    readonly fallbackPublicDeadlines: WeakMap<RequestCtx, ReturnType<typeof setTimeout>> | null;
    readonly recordStatus: (status: number) => void;
    readonly onRouteDeadlineExpire: (ctx: RequestCtx) => void;
    readonly requestCancelled: (ctx: RequestCtx) => boolean;
    readonly clearPublicDeadline: (ctx: RequestCtx) => void;
    /** `endTime` (a `performance.now()` reading) lets the caller reuse a clock read it already made. */
    readonly finishRouteRequest: (ctx: RequestCtx, endTime?: number) => void;
    readonly handleRouteFailure: (ctx: RequestCtx, err: unknown, bodyCollector: {
        cancel(): void;
    } | null) => void;
}
export declare function createRouteHandlerEnv(compiled: CompiledRoute, rt: TransportRuntimeState, isHead: boolean): RouteHandlerEnv;
