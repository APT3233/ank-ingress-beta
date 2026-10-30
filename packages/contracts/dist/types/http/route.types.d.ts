import type { Readable } from 'node:stream';
import type { Static, TSchema } from '@sinclair/typebox';
import type { Identity } from '../ports/identity.types.js';
import type { Reply } from './reply.types.js';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ResponseKind = 'json' | 'empty' | 'stream';
/**
 * `json` (default), `urlencoded` (fields arrive as strings and are coerced like query), `text` (a string),
 * or `multipart` (streamed through `req.parts()`; no body schema).
 */
export type BodyFormat = 'json' | 'urlencoded' | 'text' | 'multipart';
/** One `multipart/form-data` part. Consume `stream` (or call `text()`) before asking for the next part. */
export interface MultipartPart {
    readonly name: string;
    /** Set for file parts. */
    readonly filename: string | null;
    readonly contentType: string;
    readonly stream: Readable;
    /** Reads the whole part as UTF-8, up to the route's `multipart.maxFieldBytes`. */
    text(): Promise<string>;
}
export interface MultipartLimits {
    /** Default 100. */
    readonly maxParts?: number;
    /** Limit for `part.text()`; default 64 KiB. */
    readonly maxFieldBytes?: number;
    /** Limit for one part's header block; default 8 KiB. */
    readonly maxHeaderBytes?: number;
}
export type Access = {
    readonly kind: 'public';
} | {
    readonly kind: 'authenticated';
} | {
    readonly kind: 'permission';
    readonly code: string;
    readonly scopeParam?: string;
};
export type IdentityOf<A extends Access> = A['kind'] extends 'public' ? null : Identity;
export type SchemaOut<S extends TSchema | undefined> = S extends TSchema ? Static<S> : Readonly<Record<string, never>>;
export type ExtractRouteParamNames<Path extends string> = Path extends `${string}:${infer Param}/${infer Rest}` ? Param | ExtractRouteParamNames<`/${Rest}`> : Path extends `${string}:${infer Param}` ? Param : never;
export type ParamsOut<Path extends string, P extends TSchema | undefined> = P extends TSchema ? Static<P> : [ExtractRouteParamNames<Path>] extends [never] ? Readonly<Record<string, string | undefined>> : Readonly<Record<ExtractRouteParamNames<Path>, string>>;
export type EffectiveTxMode<A extends Access, M extends HttpMethod = HttpMethod, TxMode extends 'none' | 'read' | 'write' | undefined = undefined> = [TxMode] extends ['none' | 'read' | 'write'] ? TxMode : A['kind'] extends 'public' ? 'none' : M extends 'GET' ? 'read' : 'write';
export type ScopeTxOf<A extends Access, Tx, M extends HttpMethod = HttpMethod, TxMode extends 'none' | 'read' | 'write' | undefined = undefined> = EffectiveTxMode<A, M, TxMode> extends 'none' ? null : Tx;
export type ScopeAccessOf<A extends Access, AccessCtx, M extends HttpMethod = HttpMethod, TxMode extends 'none' | 'read' | 'write' | undefined = undefined> = A['kind'] extends 'public' ? null : A['kind'] extends 'permission' ? AccessCtx : EffectiveTxMode<A, M, TxMode> extends 'none' ? AccessCtx | null : AccessCtx;
export interface RequestOf<A extends Access = Access, P extends TSchema | undefined = undefined, Q extends TSchema | undefined = undefined, B extends TSchema | undefined = undefined, Path extends string = string> {
    readonly method: HttpMethod;
    readonly path: string;
    readonly params: ParamsOut<Path, P>;
    readonly query: SchemaOut<Q>;
    readonly body: SchemaOut<B>;
    readonly headers: Readonly<Record<string, string | undefined>>;
    readonly identity: IdentityOf<A>;
    /** Client IP, honouring X-Forwarded-For only from trusted proxies. */
    readonly ip: string | null;
    /** Parsed Cookie header; empty unless the route sets `cookies: true`. */
    readonly cookies: Readonly<Record<string, string>>;
    /** `https` only via X-Forwarded-Proto from a trusted proxy; requires `hostInfo: true`. */
    readonly protocol: 'http' | 'https';
    readonly secure: boolean;
    /** Host without port (X-Forwarded-Host from a trusted proxy wins); null unless `hostInfo: true`. */
    readonly hostname: string | null;
    readonly correlationId: string;
    readonly traceparent: string | null;
    readonly idempotencyKey: string | null;
    readonly signal: AbortSignal;
    readonly deadlineAt: number;
    /** Streams the parts of a `bodyFormat: 'multipart'` request, in order; throws on other routes. */
    parts(): AsyncIterableIterator<MultipartPart>;
}
export interface ScopeOf<A extends Access = Access, Tx = unknown, AccessCtx = unknown, M extends HttpMethod = HttpMethod, TxMode extends 'none' | 'read' | 'write' | undefined = undefined> {
    readonly tx: ScopeTxOf<A, Tx, M, TxMode>;
    readonly access: ScopeAccessOf<A, AccessCtx, M, TxMode>;
    readonly signal: AbortSignal;
    readonly deadlineAt: number;
}
export interface RouteSpec<A extends Access = Access, P extends TSchema | undefined = TSchema | undefined, Q extends TSchema | undefined = TSchema | undefined, B extends TSchema | undefined = TSchema | undefined, Tx = unknown, AccessCtx = unknown, Path extends string = string, M extends HttpMethod = HttpMethod, TxMode extends 'none' | 'read' | 'write' | undefined = 'none' | 'read' | 'write' | undefined> {
    readonly method: M;
    readonly path: Path;
    readonly access: A;
    readonly params?: P;
    readonly query?: Q;
    readonly body?: B;
    readonly bodyFormat?: BodyFormat;
    readonly multipart?: MultipartLimits;
    /** Capture the Cookie header so `req.cookies` is populated. */
    readonly cookies?: boolean;
    /** Capture Host / X-Forwarded-Proto / X-Forwarded-Host for `req.protocol`, `req.secure`, `req.hostname`. */
    readonly hostInfo?: boolean;
    /** GET only: send a weak ETag on 200 json/text replies and answer a matching If-None-Match with 304. */
    readonly etag?: boolean;
    /** Fixed-window limit per client IP (default) or authenticated account; needs a `rateLimit` store on the app. */
    readonly rateLimit?: RouteRateLimit;
    readonly response?: TSchema;
    readonly responseKind?: ResponseKind;
    readonly headers?: readonly string[];
    readonly tx?: TxMode;
    readonly idempotent?: 'required' | 'optional';
    readonly timeoutMs?: number;
    readonly maxBodyBytes?: number;
    readonly audit?: {
        readonly action: string;
        readonly resourceType: string;
        readonly objectIdParam?: string;
    };
    handle(req: RequestOf<NoInfer<A>, NoInfer<P>, NoInfer<Q>, NoInfer<B>, NoInfer<Path>>, scope: ScopeOf<NoInfer<A>, Tx, AccessCtx, NoInfer<M>, NoInfer<TxMode>>): Reply | Promise<Reply>;
}
export type AnyRoute = RouteSpec<any, any, any, any, any, any, any, any, any>;
export type RouteFor<Tx, AccessCtx> = RouteSpec<any, any, any, any, Tx, AccessCtx, any, any, any>;
export interface RouteRateLimit {
    readonly limit: number;
    readonly windowMs: number;
    /** `ip` (default) is checked before authentication; `identity` after it. */
    readonly key?: 'ip' | 'identity';
    /** Share one counter across routes; defaults to `METHOD path`. */
    readonly bucket?: string;
}
