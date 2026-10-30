import uWS, {} from 'uWebSockets.js';
import { StartupError } from '@ank-ingress/runtime';
import { compileRoute } from "../../core/compile/compile-route.js";
import { applySocketPermissions, captureSocketIdentity, ensureUnixSocketAvailable, removeSocketFile } from "./boot/unix-socket.js";
import { DeadlineWheel } from "./deadline-wheel.js";
import { createUwsRouteHandler } from "./handler/route-handler.js";
import { registerRouteFallbacks } from "./route-fallbacks.js";
function routeSpecificityScore(path) {
    const segments = path.slice(1).split('/');
    let score = 0;
    for (let i = 0; i < segments.length; i++) {
        score = score * 4 + (segments[i].startsWith(':') ? 1 : 3);
    }
    return score;
}
export function createUwsTransport(routes, rt) {
    const app = uWS.App();
    const deadlineWheel = rt.deadlineWheel ?? new DeadlineWheel(25);
    const effectiveRt = {
        ...rt,
        deadlineWheel,
        get draining() {
            return rt.draining;
        },
        set draining(v) {
            rt.draining = v;
        },
        get trustUnixSocket() {
            return rt.trustUnixSocket;
        },
        set trustUnixSocket(v) {
            rt.trustUnixSocket = v;
        },
    };
    // Sort routes so static segments register before parameterized segments on the same prefix
    const compiledList = [...routes]
        .sort((a, b) => routeSpecificityScore(b.path) - routeSpecificityScore(a.path))
        .map((r) => compileRoute(r, effectiveRt.deps));
    const methodsByPath = new Map();
    for (const compiled of compiledList) {
        let set = methodsByPath.get(compiled.path);
        if (!set) {
            set = new Set();
            methodsByPath.set(compiled.path, set);
        }
        set.add(compiled.method);
        if (compiled.method === 'GET') {
            set.add('HEAD');
        }
        const handler = createUwsRouteHandler(compiled, effectiveRt, false);
        switch (compiled.method) {
            case 'GET':
                app.get(compiled.path, handler);
                app.head(compiled.path, createUwsRouteHandler(compiled, effectiveRt, true));
                break;
            case 'POST':
                app.post(compiled.path, handler);
                break;
            case 'PUT':
                app.put(compiled.path, handler);
                break;
            case 'PATCH':
                app.patch(compiled.path, handler);
                break;
            case 'DELETE':
                app.del(compiled.path, handler);
                break;
        }
    }
    let fallbacksRegistered = false;
    function ensureFallbacksRegistered() {
        if (fallbacksRegistered)
            return;
        fallbacksRegistered = true;
        registerRouteFallbacks(app, methodsByPath, rt.decor?.cors ?? null);
    }
    let listening = false;
    return {
        app,
        deadlineWheel,
        get listening() {
            return listening;
        },
        async listen(config) {
            ensureFallbacksRegistered();
            if (config.kind === 'unix') {
                if (config.trustedIngress !== undefined) {
                    rt.trustUnixSocket = config.trustedIngress;
                }
                await ensureUnixSocketAvailable(config.path);
                return new Promise((resolve, reject) => {
                    app.listen_unix((token) => {
                        if (!token) {
                            reject(new StartupError(`Failed to listen on Unix socket "${config.path}"`));
                            return;
                        }
                        try {
                            const socketIdentity = captureSocketIdentity(config.path);
                            applySocketPermissions(config.path, config.mode);
                            listening = true;
                            resolve({
                                close() {
                                    listening = false;
                                    uWS.us_listen_socket_close(token);
                                    removeSocketFile(config.path, socketIdentity);
                                },
                            });
                        }
                        catch (err) {
                            uWS.us_listen_socket_close(token);
                            reject(err);
                        }
                    }, config.path);
                });
            }
            return new Promise((resolve, reject) => {
                app.listen(config.host, config.port, (token) => {
                    if (!token) {
                        reject(new StartupError(`Failed to listen on TCP ${config.host}:${config.port}`));
                        return;
                    }
                    const actualPort = uWS.us_socket_local_port(token);
                    listening = true;
                    resolve({
                        port: actualPort,
                        close() {
                            listening = false;
                            uWS.us_listen_socket_close(token);
                        },
                    });
                });
            });
        },
    };
}
