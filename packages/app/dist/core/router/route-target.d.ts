import type { RouteSink, RouteTarget } from '../../types/router.types.js';
export interface RouterState {
    readonly entries: Parameters<RouteSink>[];
    readonly sinks: RouteSink[];
}
export declare const routerStates: WeakMap<object, RouterState>;
/** Builds the shared get/post/.../route/use surface on top of a route sink. */
export declare function createRouteTarget<Tx, AccessCtx, Self, DA extends string = never>(sink: RouteSink, self: () => Self): RouteTarget<Tx, AccessCtx, Self, DA>;
