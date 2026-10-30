import type { HttpMethod, Identity, MultipartPart } from '@ank-ingress/contracts';
import type { LogScope } from '@ank-ingress/observability';
import type { MultipartReader } from './multipart-reader.js';
import type { RequestCtx } from './request-ctx.js';
export declare class RouteRequest {
    readonly method: HttpMethod;
    readonly path: string;
    readonly params: Record<string, unknown>;
    readonly query: Record<string, unknown>;
    readonly body: unknown;
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly identity: Identity | null;
    readonly correlationId: string;
    readonly idempotencyKey: string | null;
    readonly deadlineAt: number;
    readonly _ctx: RequestCtx;
    private readonly _execSignal;
    private readonly _multipart;
    constructor(ctx: RequestCtx, params: Record<string, unknown>, query: Record<string, unknown>, body: unknown, identity: Identity | null, execSignal?: AbortSignal, execDeadlineAt?: number, multipart?: MultipartReader | null);
    get signal(): AbortSignal;
    parts(): AsyncIterableIterator<MultipartPart>;
    get traceparent(): string | null;
    get ip(): string | null;
    get cookies(): Readonly<Record<string, string>>;
    get protocol(): 'http' | 'https';
    get secure(): boolean;
    get hostname(): string | null;
}
export declare class RouteScope<Tx = unknown, Access = unknown> {
    readonly tx: Tx;
    readonly access: Access;
    readonly deadlineAt: number;
    private readonly _ctx;
    private readonly _execSignal;
    constructor(ctx: RequestCtx, tx: Tx, access: Access, execSignal?: AbortSignal, execDeadlineAt?: number);
    get signal(): AbortSignal;
}
export declare class RequestLogScope implements LogScope {
    readonly operation: string;
    private readonly _ctx;
    constructor(ctx: RequestCtx, operation: string);
    get correlationId(): string;
    get traceId(): string;
    get spanId(): string;
    get traceparent(): string;
}
