import type { Catalogs, ConsumerSpec, JobHandlerSpec, OwnedContribution, RouteFor, SocketSpec, WorkerTaskSpec } from '@ank-ingress/contracts';
import type { Logger, MetricsRegistry } from '@ank-ingress/observability';
import type { ModuleDefinition, ProcessRole } from '../../types/module.types.js';
/** `Route`/`Consumer` are unions of each module's own types; `runApp` fills them with `RoutesOf`/`ConsumersOf`. */
export interface BootedModules<Route = RouteFor<unknown, unknown>, Consumer = ConsumerSpec<unknown>> {
    readonly catalogs: Catalogs;
    readonly routes: readonly Route[];
    readonly sockets: readonly SocketSpec[];
    readonly workerTasks: readonly WorkerTaskSpec[];
    readonly jobs: readonly JobHandlerSpec[];
    readonly consumers: readonly Consumer[];
    stop(signal: AbortSignal): Promise<void>;
}
export interface BootModulesOptions {
    readonly logger: Logger;
    readonly metrics: MetricsRegistry;
    readonly config: Readonly<Record<string, unknown>>;
    readonly services: Readonly<Record<string, unknown>>;
    readonly roles: readonly ProcessRole[];
    readonly catalogs?: Catalogs;
    readonly presetCatalogs?: readonly OwnedContribution[];
    readonly signal?: AbortSignal;
}
export declare function bootModules(defs: readonly ModuleDefinition<any, any, any, any>[], base: BootModulesOptions): Promise<BootedModules>;
