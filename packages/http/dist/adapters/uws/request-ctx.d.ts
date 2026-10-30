import type { HttpResponse } from 'uWebSockets.js';
import type { HttpMethod, Identity } from '@ank-ingress/contracts';
import { type LogScope, type TraceContext } from '@ank-ingress/observability';
import type { DeadlineLane, DeadlineWheel } from './deadline-wheel.js';
import { type ClientIpTrust, type RequestState, type ResponseDecor } from './request-state.js';
export declare class RequestCtx implements LogScope {
    state: RequestState;
    readonly res: HttpResponse;
    readonly method: HttpMethod;
    readonly path: string;
    readonly operation: string;
    readonly deadlineAt: number;
    readonly startTime: number;
    url: string;
    bodyComplete: boolean;
    workDone: boolean;
    queryRaw: string;
    params: Record<string, unknown>;
    query: Record<string, unknown>;
    headers: Record<string, string | undefined>;
    /** Always set: used by logs, error bodies, and stores. */
    correlationId: string;
    /** Written as the `x-correlation-id` response header; empty when the app disables it. */
    correlationHeader: string;
    rawTraceparent: string | undefined;
    idempotencyKey: string | null;
    /** Set only when proxies or the Unix socket are trusted. */
    ipTrust: ClientIpTrust | null;
    /** Set when this response gets security headers or an allowed-origin CORS decoration. */
    decor: ResponseDecor | null;
    /** `Access-Control-Allow-Origin` value for an allowed request origin. */
    corsOrigin: string | null;
    deadlineWheel: DeadlineWheel<RequestCtx> | null;
    deadlineLane: DeadlineLane<RequestCtx> | null;
    deadlinePrev: RequestCtx | null;
    deadlineNext: RequestCtx | null;
    onDeadlineExpire: ((ctx: RequestCtx) => void) | null;
    private _span;
    private _traceparent;
    private cancelled;
    private clientAborted;
    private abortedAttached;
    private cancelReason;
    private abortCtrl;
    private abortCallbacks;
    private _remoteAddress;
    private _ip;
    private _cookies;
    constructor(res: HttpResponse, method: HttpMethod, path: string, deadlineAt: number, captureRemoteAddress?: boolean, startTime?: number, operation?: string, attachAborted?: boolean);
    attachOnAborted(): void;
    get _ctx(): RequestCtx;
    /** Peer address; read lazily from the socket while the response is still open, otherwise ''. */
    get remoteAddress(): string;
    get ip(): string | null;
    private forwardedTrusted;
    get protocol(): 'http' | 'https';
    get secure(): boolean;
    get hostname(): string | null;
    /** Only routes with `bodyFormat: 'multipart'` stream parts; those never take this fast path. */
    parts(): never;
    get cookies(): Readonly<Record<string, string>>;
    get body(): unknown;
    get identity(): Identity | null;
    get tx(): unknown;
    get access(): unknown;
    hasSignalAllocated(): boolean;
    hasTraceGenerated(): boolean;
    get span(): TraceContext;
    get traceId(): string;
    get spanId(): string;
    get traceparent(): string;
    set traceparent(value: string | null);
    unlinkDeadline(): void;
    get socketAborted(): boolean;
    get aborted(): boolean;
    get writable(): boolean;
    get signal(): AbortSignal;
    fireAbort(reason: Error, isClientAbort?: boolean): void;
    abortDeadline(): void;
    abortShutdown(): void;
    onAbort(cb: () => void): void;
}
