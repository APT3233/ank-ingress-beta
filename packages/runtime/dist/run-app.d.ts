import type { ConfigOf, Schema } from '@ank-ingress/config';
import type { Catalogs, OwnedContribution } from '@ank-ingress/contracts';
import type { BootContext, Inbound, RuntimeHandle, RuntimeHost } from './types/lifecycle.types.js';
import type { ConsumersOf, ModuleDefinition, NeedsFor, ProcessRole, RoutesOf, ServicesCheck } from './types/module.types.js';
import { type BootedModules } from './core/modules/boot-modules.js';
export interface RunAppSpec<S extends Schema = Schema, Services = Readonly<Record<string, unknown>>, Mods extends readonly ModuleDefinition<unknown, unknown>[] = readonly ModuleDefinition<unknown, unknown>[], Roles extends ProcessRole = ProcessRole> {
    readonly name: string;
    readonly schema: S;
    /** Contributions of these roles are built; modules with none of them only add catalog entries. */
    readonly roles: readonly Roles[];
    readonly modules?: Mods;
    readonly presetCatalogs?: readonly OwnedContribution[];
    readonly host?: RuntimeHost;
    setupInfra?(ctx: BootContext, config: ConfigOf<S>, catalogs: Catalogs): Promise<Services> | Services;
    /** `modules.routes`/`consumers` keep each module's own `Tx`/`Access`; a mismatch surfaces where they meet the scope. */
    boot(ctx: BootContext, config: ConfigOf<S>, modules: BootedModules<RoutesOf<Mods>, ConsumersOf<Mods>>, services: Services): Promise<Inbound> | Inbound;
}
/** Fails to typecheck when `Services` lacks a service that an active role of `modules` requires. */
export declare function runApp<S extends Schema, Services = Readonly<Record<string, unknown>>, const Mods extends readonly ModuleDefinition<unknown, unknown>[] = readonly [], const Roles extends ProcessRole = never>(spec: RunAppSpec<S, Services, Mods, Roles> & ServicesCheck<Services, NeedsFor<Mods, Roles>>): RuntimeHandle;
