import { createRouteTarget, routerStates } from "./route-target.js";
/**
 * With explicit `Tx`/`AccessCtx` type arguments, also pass the default access type:
 * `createRouter<Tx, Ctx, 'notes:read'>({ access: 'notes:read' })`.
 */
export function createRouter(defaults = {}) {
    const state = { entries: [], sinks: [] };
    const router = createRouteTarget((method, path, options, handler) => {
        const entry = [method, path, { ...defaults, ...options }, handler];
        state.entries.push(entry);
        for (const sink of state.sinks)
            sink(...entry);
    }, () => router);
    routerStates.set(router, state);
    return router;
}
