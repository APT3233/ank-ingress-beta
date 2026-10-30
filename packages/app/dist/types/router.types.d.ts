import type { HttpMethod, Reply } from '@ank-ingress/contracts';
import type { MethodRegistrar, PathRegistrar, RouteOptions, SchemaInput, TxModeInput } from './route-options.types.js';
/** Options a router applies to its routes (and mounted routers' routes) unless a route sets them. */
export interface RouterDefaults<DA extends string = never> {
    readonly access?: DA;
    readonly scopeParam?: string;
    readonly timeoutMs?: number;
    readonly maxBodyBytes?: number;
}
/** Returned by `route(path)`: registers several methods on one path. */
export interface RouteChain<Path extends string, Tx = unknown, AccessCtx = unknown, DA extends string = never> {
    readonly get: PathRegistrar<'GET', Path, Tx, AccessCtx, RouteChain<Path, Tx, AccessCtx, DA>, DA>;
    readonly post: PathRegistrar<'POST', Path, Tx, AccessCtx, RouteChain<Path, Tx, AccessCtx, DA>, DA>;
    readonly put: PathRegistrar<'PUT', Path, Tx, AccessCtx, RouteChain<Path, Tx, AccessCtx, DA>, DA>;
    readonly patch: PathRegistrar<'PATCH', Path, Tx, AccessCtx, RouteChain<Path, Tx, AccessCtx, DA>, DA>;
    readonly delete: PathRegistrar<'DELETE', Path, Tx, AccessCtx, RouteChain<Path, Tx, AccessCtx, DA>, DA>;
}
export interface RouteTarget<Tx, AccessCtx, Self, DA extends string = never> {
    readonly get: MethodRegistrar<'GET', Tx, AccessCtx, Self, DA>;
    readonly post: MethodRegistrar<'POST', Tx, AccessCtx, Self, DA>;
    readonly put: MethodRegistrar<'PUT', Tx, AccessCtx, Self, DA>;
    readonly patch: MethodRegistrar<'PATCH', Tx, AccessCtx, Self, DA>;
    readonly delete: MethodRegistrar<'DELETE', Tx, AccessCtx, Self, DA>;
    route<const Path extends string>(path: Path): RouteChain<Path, Tx, AccessCtx, DA>;
    /** Mounts a router; its current and future routes are registered under `path`. */
    use(router: Router<Tx, AccessCtx, string>): Self;
    use(path: string, router: Router<Tx, AccessCtx, string>): Self;
}
export interface Router<Tx = unknown, AccessCtx = unknown, DA extends string = never> extends RouteTarget<Tx, AccessCtx, Router<Tx, AccessCtx, DA>, DA> {
}
export type AnyRouteOptions = RouteOptions<string, SchemaInput | undefined, SchemaInput | undefined, SchemaInput | undefined, TxModeInput, string>;
export type AnyRouteHandler = (req: never, scope: never) => Reply | Promise<Reply>;
export type RouteSink = (method: HttpMethod, path: string, options: AnyRouteOptions, handler: AnyRouteHandler) => void;
