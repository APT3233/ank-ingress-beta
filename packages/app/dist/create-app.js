import { buildCatalogs, defineRoute } from '@ank-ingress/contracts';
import { createHttpApp } from '@ank-ingress/http';
import { CompositionError } from '@ank-ingress/kernel';
import { createLogger } from '@ank-ingress/observability';
import { createSignalShutdown } from "./adapters/node-process/signal-shutdown.js";
import { toAccess } from "./core/access/to-access.js";
import { joinPath } from "./core/router/join-path.js";
import { createRouteTarget } from "./core/router/route-target.js";
import { toSchema } from "./core/schema/to-schema.js";
export function createApp(options = {}) {
    const { prefix = '/api/v1', catalogs, logger, handleSignals = false, ...httpOptions } = options;
    const routes = [];
    let sealed = false;
    function assertOpen(label) {
        if (sealed)
            throw new CompositionError(`Cannot register ${label} after listen() or inbound()`);
    }
    function sealAndBuild() {
        if (sealed)
            throw new CompositionError('App is already listening');
        sealed = true;
        const appLogger = logger ?? createLogger({ service: 'app' });
        const http = createHttpApp({
            ...httpOptions,
            routes,
            catalogs: catalogs ?? buildCatalogs([]),
            logger: appLogger,
        });
        return { http, appLogger };
    }
    const app = {
        ...createRouteTarget((method, path, routeOptions, handler) => {
            assertOpen(`"${method} ${path}"`);
            const { access, scopeParam, params, query, body, ...rest } = routeOptions;
            if (access === undefined) {
                throw new CompositionError(`Route "${method} ${path}" has no access and its router sets no default`);
            }
            const spec = {
                ...rest,
                method,
                path: joinPath(prefix, path),
                access: toAccess(access, scopeParam),
                ...(params === undefined ? {} : { params: toSchema(params) }),
                ...(query === undefined ? {} : { query: toSchema(query) }),
                ...(body === undefined ? {} : { body: toSchema(body) }),
                handle: handler,
            };
            routes.push(defineRoute(spec));
        }, () => app),
        prefix,
        routes,
        add(...specs) {
            for (const spec of specs) {
                assertOpen(`"${spec.method} ${spec.path}"`);
                routes.push(spec);
            }
            return app;
        },
        inbound(listen) {
            return sealAndBuild().http.inbound(listen);
        },
        async listen(port = 0, hostOrCallback, callback) {
            const host = typeof hostOrCallback === 'string' ? hostOrCallback : '0.0.0.0';
            const onListening = typeof hostOrCallback === 'function' ? hostOrCallback : callback;
            const { http, appLogger } = sealAndBuild();
            const inbound = http.inbound({ kind: 'tcp', host, port });
            await inbound.start();
            let closing;
            const close = (drainSignal) => {
                closing ??= (async () => {
                    shutdown.remove();
                    await inbound.stop();
                    await inbound.drain(drainSignal);
                    await appLogger.flush();
                })();
                return closing;
            };
            const shutdown = createSignalShutdown(appLogger, handleSignals, close);
            if (handleSignals !== false)
                shutdown.install();
            const server = {
                port: inbound.port ?? port,
                close: () => close(new AbortController().signal),
            };
            onListening?.(server);
            return server;
        },
    };
    return app;
}
