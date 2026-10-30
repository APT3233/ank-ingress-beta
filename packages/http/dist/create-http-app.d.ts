import type { Catalogs, RateLimitStore, RouteFor } from '@ank-ingress/contracts';
import type { Logger, MetricsRegistry } from '@ank-ingress/observability';
import { type Inbound, type WorkTracker } from '@ank-ingress/runtime';
import type { HttpLimits } from './types/limits.types.js';
import type { CorsOptions } from './types/cors.types.js';
import type { ListenConfig } from './types/listen.types.js';
import type { AuditHook, AuthStage, AuthorizeStage, ScopeStage } from './types/stages.types.js';
import { type SecurityHeadersOption } from './core/headers/security-headers.js';
import { type UwsTransport } from './adapters/uws/uws-transport.js';
export interface CreateHttpAppOptions<Tx = unknown, Access = unknown> {
    readonly routes: readonly RouteFor<NoInfer<Tx>, NoInfer<Access>>[];
    readonly catalogs: Catalogs;
    readonly limits?: HttpLimits;
    readonly trustedProxies?: readonly string[];
    readonly trustUnixSocket?: boolean;
    readonly auth?: AuthStage;
    readonly authorize?: AuthorizeStage;
    readonly scope?: ScopeStage<Tx, Access>;
    readonly onAudit?: AuditHook<Tx, Access>;
    /** Counter store for routes that declare `rateLimit`. */
    readonly rateLimit?: RateLimitStore;
    /**
     * `false`: ignore the request's X-Correlation-Id and omit it from responses (an id is still generated
     * for logs, error bodies, and stores). Saves a header read and ~56 response bytes per request.
     */
    readonly correlationHeader?: boolean;
    /** `false`: do not read W3C traceparent; every request starts a new trace. Saves a header read. */
    readonly traceparent?: boolean;
    /** Adds CORS headers for allowed origins and answers OPTIONS preflight on every route path. */
    readonly cors?: CorsOptions;
    /** Adds helmet-style security headers to every route response; a reply header of the same name wins. */
    readonly securityHeaders?: SecurityHeadersOption;
    readonly logger: Logger;
    readonly metrics?: MetricsRegistry;
}
export interface HttpApp {
    readonly workTracker: WorkTracker;
    readonly transport: UwsTransport;
    readonly logger: Logger;
    readonly trustedProxies: ReadonlySet<string>;
    readonly trustUnixSocket: boolean;
    readonly draining: boolean;
    tryEnterWork(): (() => void) | null;
    onStop(callback: () => void): () => void;
    onDrainTimeout(callback: () => void): () => void;
    inbound(listenConfig: ListenConfig): Inbound & {
        readonly port?: number;
    };
    /** Publishes to every WebSocket subscribed to `topic`; returns `false` when the app is not listening or no socket received it. */
    publish(topic: string, message: string | ArrayBuffer, isBinary?: boolean): boolean;
}
export declare const HTTP_IN_FLIGHT_METRIC = "ank_http_in_flight_work";
export declare function createHttpApp<Tx = unknown, Access = unknown>(options: CreateHttpAppOptions<Tx, Access>): HttpApp;
