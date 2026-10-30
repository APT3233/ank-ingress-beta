import { tenantTopic } from "../../../core/hub/tenant-topic.js";
import { createUpgradeHandler } from "./socket-upgrade.js";
export function mountSocket(httpApp, spec, deps) {
    const maxPayloadLength = spec.maxPayloadLength ?? 64 * 1024;
    const idleTimeout = spec.idleTimeoutSec ?? 60;
    const maxBackpressure = spec.maxBackpressureBytes ?? 256 * 1024;
    const maxPendingMessages = spec.maxPendingMessages ?? 32;
    const logger = deps.logger ?? httpApp.logger;
    let stopping = false;
    const clients = new Set();
    const pendingUpgrades = new Set();
    const clearQueue = (userData) => {
        for (const item of userData.messageQueue.splice(0))
            item.done();
    };
    const closeIfDrained = (ws, userData) => {
        if (stopping && !userData.closed && userData.pendingHooks === 0 && userData.messageQueue.length === 0) {
            userData.client.close(1001, 'Server shutting down');
        }
    };
    httpApp.onDrainTimeout(() => {
        for (const ws of [...clients])
            ws.close();
    });
    httpApp.onStop(() => {
        stopping = true;
        for (const cancel of pendingUpgrades)
            cancel();
        for (const ws of clients)
            closeIfDrained(ws, ws.getUserData());
    });
    const handleHookError = (ws, userData, hook, err) => {
        logger?.error('ws.handler_error', {
            path: spec.path,
            hook,
            accountId: userData.identity.accountId,
            correlationId: userData.identity.correlationId,
            error: err instanceof Error ? err.message : String(err),
        });
        if (!userData.closed) {
            userData.closed = true;
            userData.backpressured = false;
            clearQueue(userData);
            try {
                ws.end(1011, 'Internal error');
            }
            catch {
                // ignore if already closed
            }
        }
    };
    const runHook = (ws, userData, hook, callback, done = httpApp.workTracker.enter(), settled) => {
        userData.pendingHooks += 1;
        const finish = () => {
            userData.pendingHooks -= 1;
            settled?.();
            closeIfDrained(ws, userData);
            done();
        };
        try {
            Promise.resolve(callback()).then(finish, (err) => {
                handleHookError(ws, userData, hook, err);
                finish();
            });
        }
        catch (err) {
            handleHookError(ws, userData, hook, err);
            finish();
        }
    };
    const pumpMessages = (ws, userData) => {
        if (userData.inFlightMessages !== 0 || userData.closed || !spec.onMessage)
            return;
        const next = userData.messageQueue.shift();
        if (!next)
            return;
        userData.inFlightMessages += 1;
        runHook(ws, userData, 'onMessage', () => spec.onMessage(userData.client, next.data, next.isBinary), next.done, () => {
            userData.inFlightMessages -= 1;
            pumpMessages(ws, userData);
        });
    };
    httpApp.transport.app.ws(spec.path, {
        maxPayloadLength,
        idleTimeout,
        maxBackpressure,
        closeOnBackpressureLimit: false,
        upgrade: createUpgradeHandler(httpApp, deps, pendingUpgrades),
        open: (ws) => {
            const userData = ws.getUserData();
            const { identity } = userData;
            clients.add(ws);
            const sendWithStatus = (_topic, data, options) => {
                if (userData.closed) {
                    return 'dropped';
                }
                const bufferedBefore = ws.getBufferedAmount();
                if (bufferedBefore >= maxBackpressure) {
                    if (!options?.lossy) {
                        userData.closed = true;
                        userData.backpressured = false;
                        clearQueue(userData);
                        try {
                            ws.end(1013, 'Backpressure limit exceeded');
                        }
                        catch {
                            // ignore if already closed
                        }
                    }
                    return 'dropped';
                }
                // uWS ws.send returns: 1 = SUCCESS, 0 = BACKPRESSURE (accepted), 2 = DROPPED
                const status = ws.send(data, typeof data !== 'string');
                if (status === 2) {
                    if (!options?.lossy && !userData.closed) {
                        userData.closed = true;
                        userData.backpressured = false;
                        clearQueue(userData);
                        try {
                            ws.end(1013, 'Backpressure limit exceeded');
                        }
                        catch {
                            // ignore
                        }
                    }
                    return 'dropped';
                }
                if (status === 0) {
                    userData.backpressured = true;
                    return 'backpressure';
                }
                return 'sent';
            };
            const client = {
                identity,
                get closed() {
                    return userData.closed;
                },
                sendWithStatus,
                send(topic, data, options) {
                    const st = sendWithStatus(topic, data, options);
                    return st !== 'dropped';
                },
                subscribe(topic) {
                    if (userData.closed)
                        return;
                    ws.subscribe(tenantTopic(identity.tenantId, topic));
                },
                unsubscribe(topic) {
                    if (userData.closed)
                        return;
                    ws.unsubscribe(tenantTopic(identity.tenantId, topic));
                },
                close(code = 1000, reason = 'Normal closure') {
                    if (userData.closed)
                        return;
                    userData.closed = true;
                    userData.backpressured = false;
                    clearQueue(userData);
                    try {
                        ws.end(code, reason);
                    }
                    catch {
                        // ignore if already closed
                    }
                },
                getBufferedAmount() {
                    return userData.closed ? 0 : ws.getBufferedAmount();
                },
            };
            userData.client = client;
            if (spec.onOpen)
                runHook(ws, userData, 'onOpen', () => spec.onOpen(client));
            closeIfDrained(ws, userData);
        },
        message: (ws, message, isBinary) => {
            const userData = ws.getUserData();
            if (httpApp.draining || userData.closed || !spec.onMessage) {
                return;
            }
            if (userData.inFlightMessages + userData.messageQueue.length >= maxPendingMessages) {
                logger?.warn('ws.pending_messages_exceeded', {
                    path: spec.path,
                    accountId: userData.identity.accountId,
                    correlationId: userData.identity.correlationId,
                    maxPendingMessages,
                });
                userData.closed = true;
                userData.backpressured = false;
                clearQueue(userData);
                try {
                    ws.end(1008, 'Too many pending messages');
                }
                catch {
                    // ignore
                }
                return;
            }
            const done = httpApp.tryEnterWork();
            if (!done) {
                userData.client.close(1013, 'Server overloaded');
                return;
            }
            // Copy out of uWS ephemeral ArrayBuffer before any async boundary
            const copy = new Uint8Array(message.byteLength);
            copy.set(new Uint8Array(message));
            userData.messageQueue.push({ data: copy, isBinary, done });
            pumpMessages(ws, userData);
        },
        drain: (ws) => {
            const userData = ws.getUserData();
            if (httpApp.draining || userData.closed)
                return;
            userData.backpressured = ws.getBufferedAmount() >= maxBackpressure;
            if (spec.onDrain)
                runHook(ws, userData, 'onDrain', () => spec.onDrain(userData.client));
        },
        close: (ws, code) => {
            const userData = ws.getUserData();
            clients.delete(ws);
            userData.closed = true;
            userData.backpressured = false;
            clearQueue(userData);
            if (spec.onClose)
                runHook(ws, userData, 'onClose', () => spec.onClose(userData.client, code));
        },
    });
}
