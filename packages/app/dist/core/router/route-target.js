import { CompositionError } from '@ank-ingress/kernel';
import { joinPath } from "./join-path.js";
const METHODS = [
    ['get', 'GET'],
    ['post', 'POST'],
    ['put', 'PUT'],
    ['patch', 'PATCH'],
    ['delete', 'DELETE'],
];
export const routerStates = new WeakMap();
function mount(router, sink) {
    const state = routerStates.get(router);
    if (!state)
        throw new CompositionError('use() expects a router created by createRouter()');
    for (const entry of state.entries)
        sink(...entry);
    state.sinks.push(sink);
}
/** Builds the shared get/post/.../route/use surface on top of a route sink. */
export function createRouteTarget(sink, self) {
    const target = {};
    for (const [name, method] of METHODS) {
        target[name] = (path, options, handler) => {
            sink(method, path, options, handler);
            return self();
        };
    }
    target.route = (path) => {
        const chain = {};
        for (const [name, method] of METHODS) {
            chain[name] = (options, handler) => {
                sink(method, path, options, handler);
                return chain;
            };
        }
        return chain;
    };
    target.use = (pathOrRouter, router) => {
        const base = typeof pathOrRouter === 'string' ? pathOrRouter : '/';
        const mounted = router ?? pathOrRouter;
        if (mounted === self())
            throw new CompositionError('A router cannot be mounted into itself');
        mount(mounted, (method, path, options, handler) => {
            sink(method, joinPath(base, path), options, handler);
        });
        return self();
    };
    return target;
}
