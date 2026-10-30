import { CompositionError } from '@ank-ingress/kernel';
import { buildModuleCatalogs } from "./module-catalogs.js";
const ROLE_ORDER = ['http', 'sockets', 'tasks', 'jobs', 'consumers'];
function createSlot(label, keyOf) {
    const items = [];
    const seen = new Map();
    return {
        items,
        add(owner, built) {
            for (const item of built) {
                const key = keyOf(item);
                const prev = seen.get(key);
                if (prev) {
                    throw new CompositionError(`Duplicate ${label} "${key}" registered by "${prev}" and "${owner}"`);
                }
                seen.set(key, owner);
                items.push(item);
            }
        },
    };
}
export async function bootModules(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
defs, base) {
    const names = new Set();
    for (const def of defs) {
        if (names.has(def.name)) {
            throw new CompositionError(`Duplicate module name "${def.name}"`);
        }
        names.add(def.name);
    }
    const catalogs = base.catalogs ?? buildModuleCatalogs(defs, base.presetCatalogs);
    const roles = new Set(base.roles);
    const signal = base.signal ?? new AbortController().signal;
    const setUp = [];
    const routes = createSlot('route', (r) => `${r.method} ${r.path}`);
    const sockets = createSlot('socket', (s) => s.path);
    const workerTasks = createSlot('workerTask', (t) => t.name);
    const jobs = createSlot('job', (j) => j.spec.name);
    const consumers = createSlot('consumer', (c) => c.name);
    const stopSetUp = async () => {
        const rollbackSignal = AbortSignal.timeout(5_000);
        for (const item of [...setUp].reverse()) {
            try {
                await item.stop?.(rollbackSignal);
            }
            catch (err) {
                base.logger.error('module.rollback_stop_failed', {
                    module: item.name,
                    detail: err instanceof Error ? err.message : String(err),
                });
            }
        }
    };
    try {
        for (const mod of defs) {
            signal.throwIfAborted();
            const contributes = mod.contributes;
            const active = ROLE_ORDER.filter((role) => roles.has(role) && contributes[role] !== undefined);
            if (active.length === 0)
                continue;
            const config = mod.schema
                ? Object.freeze(Object.fromEntries(Object.keys(mod.schema).map((k) => [k, base.config[k]])))
                : base.config;
            const logger = base.logger.child({ module: mod.name });
            const build = async (role, contribution) => {
                for (const [key, need] of Object.entries(contribution.needs)) {
                    if (need === 'required' && !(Object.hasOwn(base.services, key) && base.services[key] !== undefined)) {
                        throw new CompositionError(`Module "${mod.name}" contribution "${role}" requires service "${key}"`);
                    }
                }
                let out;
                try {
                    out = await contribution.build({ logger, metrics: base.metrics, config, catalogs, services: base.services });
                }
                catch (err) {
                    if (err instanceof CompositionError)
                        throw err;
                    throw new CompositionError(`Module "${mod.name}" contribution "${role}" build failed: ${err instanceof Error ? err.message : String(err)}`);
                }
                if (setUp.at(-1) !== mod)
                    setUp.push(mod);
                return out;
            };
            for (const role of active) {
                signal.throwIfAborted();
                switch (role) {
                    case 'http':
                        if (contributes.http)
                            routes.add(mod.name, await build(role, contributes.http));
                        break;
                    case 'sockets':
                        if (contributes.sockets)
                            sockets.add(mod.name, await build(role, contributes.sockets));
                        break;
                    case 'tasks':
                        if (contributes.tasks)
                            workerTasks.add(mod.name, await build(role, contributes.tasks));
                        break;
                    case 'jobs':
                        if (contributes.jobs)
                            jobs.add(mod.name, await build(role, contributes.jobs));
                        break;
                    case 'consumers':
                        if (contributes.consumers)
                            consumers.add(mod.name, await build(role, contributes.consumers));
                        break;
                }
            }
        }
        for (const item of setUp) {
            signal.throwIfAborted();
            try {
                await item.start?.(signal);
            }
            catch (err) {
                if (err instanceof CompositionError)
                    throw err;
                throw new CompositionError(`Module "${item.name}" start failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    catch (err) {
        await stopSetUp();
        if (err instanceof CompositionError)
            throw err;
        throw new CompositionError(err instanceof Error ? err.message : String(err));
    }
    return {
        catalogs,
        routes: Object.freeze(routes.items),
        sockets: Object.freeze(sockets.items),
        workerTasks: Object.freeze(workerTasks.items),
        jobs: Object.freeze(jobs.items),
        consumers: Object.freeze(consumers.items),
        async stop(stopSignal) {
            const errors = [];
            for (const item of [...setUp].reverse()) {
                try {
                    await item.stop?.(stopSignal);
                }
                catch (err) {
                    errors.push(err);
                    base.logger.error('module.stop_failed', {
                        module: item.name,
                        detail: err instanceof Error ? err.message : String(err),
                    });
                }
            }
            if (errors.length === 1) {
                throw errors[0];
            }
            if (errors.length > 1) {
                throw new AggregateError(errors, errors.map((e) => (e instanceof Error ? e.message : String(e))).join('; '));
            }
        },
    };
}
