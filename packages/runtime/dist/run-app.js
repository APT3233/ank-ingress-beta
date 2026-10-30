import { CompositionError } from '@ank-ingress/kernel';
import { nodeHost } from "./adapters/node-process/node-host.js";
import { startProcess } from "./core/lifecycle/start-process.js";
import { bootModules } from "./core/modules/boot-modules.js";
import { buildModuleCatalogs } from "./core/modules/module-catalogs.js";
/** Fails to typecheck when `Services` lacks a service that an active role of `modules` requires. */
export function runApp(spec) {
    const host = spec.host ?? nodeHost();
    const mergedSchema = {};
    const schemaOwners = new Map();
    const envOwners = new Map();
    const registerSchema = (owner, s) => {
        for (const [key, field] of Object.entries(s)) {
            const prevKeyOwner = schemaOwners.get(key);
            if (prevKeyOwner) {
                throw new CompositionError(`Duplicate config schema key "${key}" declared by "${prevKeyOwner}" and "${owner}"`);
            }
            const prevEnvOwner = envOwners.get(field.env);
            if (prevEnvOwner) {
                throw new CompositionError(`Duplicate config env variable "${field.env}" declared by "${prevEnvOwner}" and "${owner}"`);
            }
            schemaOwners.set(key, owner);
            envOwners.set(field.env, owner);
            mergedSchema[key] = field;
        }
    };
    for (const mod of spec.modules ?? []) {
        if (mod.schema) {
            registerSchema(`module:${mod.name}`, mod.schema);
        }
    }
    registerSchema(`app:${spec.name}`, spec.schema);
    return startProcess({
        app: spec.name,
        schema: mergedSchema,
        async boot(ctx, config) {
            ctx.signal.throwIfAborted();
            const catalogs = buildModuleCatalogs(spec.modules ?? [], spec.presetCatalogs);
            const services = spec.setupInfra
                ? await ctx.phase('infra', async () => await spec.setupInfra(ctx, config, catalogs))
                : {};
            ctx.signal.throwIfAborted();
            const booted = await ctx.phase('modules', () => bootModules(spec.modules ?? [], {
                logger: ctx.logger,
                metrics: ctx.metrics,
                config: config,
                services: (services ?? {}),
                roles: spec.roles,
                ...(spec.presetCatalogs ? { presetCatalogs: spec.presetCatalogs } : {}),
                catalogs,
                signal: ctx.signal,
            }));
            if (ctx.onStopModules) {
                ctx.onStopModules((sig) => booted.stop(sig));
            }
            else {
                ctx.use({
                    name: 'modules',
                    required: true,
                    check: async () => { },
                    close: () => booted.stop(AbortSignal.timeout(5_000)),
                });
            }
            ctx.signal.throwIfAborted();
            // Erasure point: `bootModules` returns exactly the items the typed `spec.modules` built.
            const typed = booted;
            return spec.boot(ctx, config, typed, services);
        },
    }, host);
}
