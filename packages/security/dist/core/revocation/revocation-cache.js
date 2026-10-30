import { AppError } from '@ank-ingress/kernel';
import { assertNotRevoked } from "./assert-not-revoked.js";
import { createEntryStore } from "./entry-store.js";
export function createRevocationCache(options) {
    const ttlMs = options.ttlMs ?? 5_000;
    const maxEntries = options.max ?? 100_000;
    const loadTimeoutMs = options.loadTimeoutMs ?? 2_000;
    const channel = options.channel ?? 'ank:auth:revoke';
    const store = createEntryStore(maxEntries);
    const inflight = new Map();
    let generation = 0;
    const invalidate = (keyOrFilter) => {
        generation += 1;
        for (const inf of inflight.values()) {
            if (inf.jti === keyOrFilter || inf.sub === keyOrFilter || inf.sid === keyOrFilter) {
                inf.invalidated = true;
            }
        }
        store.delete(keyOrFilter);
        const subSet = store.jtisBySub(keyOrFilter);
        if (subSet) {
            for (const jti of [...subSet]) {
                store.delete(jti);
            }
        }
        const sidSet = store.jtisBySid(keyOrFilter);
        if (sidSet) {
            for (const jti of [...sidSet]) {
                store.delete(jti);
            }
        }
    };
    let unsubscribe;
    if (options.bus) {
        unsubscribe = options.bus.subscribe(channel, (raw) => {
            try {
                const parsed = JSON.parse(raw);
                if (parsed.jti)
                    invalidate(parsed.jti);
                if (parsed.sid)
                    invalidate(parsed.sid);
                if (parsed.sub)
                    invalidate(parsed.sub);
            }
            catch {
                invalidate(raw);
            }
        });
    }
    const resource = {
        name: 'revocation-cache-bus',
        required: false,
        async check() {
            const ok = options.bus?.isConnected
                ? options.bus.isConnected()
                : options.bus?.isHealthy
                    ? options.bus.isHealthy()
                    : true;
            if (!ok) {
                throw new Error('Revocation invalidation Pub/Sub bus is disconnected');
            }
        },
        async close() {
            const unsub = await unsubscribe;
            await unsub?.();
            for (const entry of inflight.values())
                entry.loadAbort.abort(new Error('Revocation cache closed'));
            store.clear();
            inflight.clear();
        },
    };
    const loadSource = (claims, signal, tx) => {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (error, state) => {
                if (settled)
                    return;
                settled = true;
                signal.removeEventListener('abort', onAbort);
                if (error !== undefined)
                    reject(error);
                else
                    resolve(state);
            };
            const onAbort = () => finish(signal.reason ?? new AppError('COMMON-503-UNAVAILABLE', { message: 'Revocation load cancelled' }));
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
            try {
                options.source.load(claims, signal, tx).then((state) => finish(undefined, state), (error) => finish(error));
            }
            catch (error) {
                finish(error);
            }
        });
    };
    const getOrCreateInflight = (claims) => {
        const existing = inflight.get(claims.jti);
        if (existing && !existing.invalidated && !existing.loadAbort.signal.aborted) {
            return existing;
        }
        const loadAbort = new AbortController();
        const startGen = generation;
        const timer = setTimeout(() => {
            if (!loadAbort.signal.aborted) {
                loadAbort.abort(new AppError('COMMON-503-UNAVAILABLE', {
                    message: 'Revocation source load timed out',
                }));
            }
        }, loadTimeoutMs);
        const entry = {
            jti: claims.jti,
            sub: claims.sub,
            sid: claims.sid,
            startGen,
            loadAbort,
            activeWaiters: 0,
            invalidated: false,
            promise: Promise.resolve(),
        };
        const p = loadSource(claims, loadAbort.signal)
            .then((state) => {
            if (!entry.invalidated && entry.startGen === generation) {
                store.set(claims.jti, {
                    state,
                    expiresAtMs: Date.now() + ttlMs,
                    sub: claims.sub,
                    sid: claims.sid,
                });
            }
            return state;
        })
            .finally(() => {
            clearTimeout(timer);
            if (inflight.get(claims.jti) === entry) {
                inflight.delete(claims.jti);
            }
        });
        entry.promise = p;
        inflight.set(claims.jti, entry);
        return entry;
    };
    const waitForInflight = (entry, signal) => {
        if (signal.aborted) {
            return Promise.reject(signal.reason instanceof Error
                ? signal.reason
                : new AppError('COMMON-503-UNAVAILABLE', { message: 'Aborted before revocation check' }));
        }
        entry.activeWaiters += 1;
        return new Promise((resolve, reject) => {
            let settled = false;
            const onCallerAbort = () => {
                if (settled)
                    return;
                settled = true;
                entry.activeWaiters = Math.max(0, entry.activeWaiters - 1);
                if (entry.activeWaiters === 0 && !entry.loadAbort.signal.aborted) {
                    entry.loadAbort.abort(signal.reason instanceof Error
                        ? signal.reason
                        : new AppError('COMMON-503-UNAVAILABLE', { message: 'All revocation waiters aborted' }));
                }
                reject(signal.reason instanceof Error
                    ? signal.reason
                    : new AppError('COMMON-503-UNAVAILABLE', { message: 'Aborted while checking token revocation' }));
            };
            signal.addEventListener('abort', onCallerAbort, { once: true });
            entry.promise.then((state) => {
                if (settled)
                    return;
                settled = true;
                signal.removeEventListener('abort', onCallerAbort);
                entry.activeWaiters = Math.max(0, entry.activeWaiters - 1);
                resolve(state);
            }, (err) => {
                if (settled)
                    return;
                settled = true;
                signal.removeEventListener('abort', onCallerAbort);
                entry.activeWaiters = Math.max(0, entry.activeWaiters - 1);
                reject(err);
            });
        });
    };
    const checkCached = (claims) => {
        const existing = store.get(claims.jti);
        if (existing === undefined)
            return false;
        if (existing.expiresAtMs <= Date.now()) {
            store.delete(claims.jti);
            return false;
        }
        store.touch(claims.jti, existing);
        assertNotRevoked(claims, existing.state);
        return true;
    };
    return {
        invalidate,
        resource,
        checkCached,
        async check(claims, signal, tx) {
            if (signal.aborted) {
                throw signal.reason instanceof Error
                    ? signal.reason
                    : new AppError('COMMON-503-UNAVAILABLE', { message: 'Aborted before revocation check' });
            }
            if (checkCached(claims)) {
                return;
            }
            if (tx !== undefined) {
                const startGen = generation;
                const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(loadTimeoutMs)]);
                const state = await loadSource(claims, combinedSignal, tx);
                if (startGen === generation) {
                    store.set(claims.jti, {
                        state,
                        expiresAtMs: Date.now() + ttlMs,
                        sub: claims.sub,
                        sid: claims.sid,
                    });
                }
                assertNotRevoked(claims, state);
                return;
            }
            let entry = getOrCreateInflight(claims);
            let state = await waitForInflight(entry, signal);
            if (entry.invalidated || entry.startGen !== generation) {
                entry = getOrCreateInflight(claims);
                state = await waitForInflight(entry, signal);
            }
            assertNotRevoked(claims, state);
        },
    };
}
