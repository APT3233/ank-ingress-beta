import type { Schema } from '@ank-ingress/config';
import type { CatalogContribution, Catalogs, ConsumerSpec, JobHandlerSpec, RouteFor, SocketSpec, WorkerTaskSpec } from '@ank-ingress/contracts';
import type { Logger, MetricsRegistry } from '@ank-ingress/observability';
export type ProcessRole = 'http' | 'sockets' | 'tasks' | 'jobs' | 'consumers';
/** 'required': missing fails `runApp` at typecheck and `bootModules` with a CompositionError. 'optional': `build` sees `T | undefined`. */
export type NeedSpec<Needs> = {
    readonly [K in keyof Needs]-?: 'required' | 'optional';
};
export interface ContributionContext<Needs, Config = Readonly<Record<string, unknown>>> {
    readonly logger: Logger;
    readonly metrics: MetricsRegistry;
    readonly config: Config;
    readonly catalogs: Catalogs;
    readonly services: Needs;
}
type RequiredKeys<Spec> = {
    [K in keyof Spec]-?: Spec[K] extends 'required' ? K : never;
}[keyof Spec];
/** What `build` sees: 'required' keys as `Needs[K]`, every other key as `Needs[K] | undefined`. */
export type ServicesFor<Needs, Spec> = {
    readonly [K in keyof Needs as K extends RequiredKeys<Spec> ? K : never]-?: Exclude<Needs[K], undefined>;
} & {
    readonly [K in keyof Needs as K extends RequiredKeys<Spec> ? never : K]: Needs[K] | undefined;
};
declare const contributionBrand: unique symbol;
/** Created only by `contribution()`; the brand keeps raw object literals out of `ModuleContributions`. */
export interface Contribution<Needs, Out, Spec extends NeedSpec<Needs> = NeedSpec<Needs>, Config = Readonly<Record<string, unknown>>> {
    readonly [contributionBrand]: true;
    readonly needs: Spec;
    build(ctx: ContributionContext<ServicesFor<Needs, Spec>, Config>): Out | Promise<Out>;
}
/** Erased registry slots: each branded contribution keeps its own `Needs`, read back by `NeedsFor`. */
export interface ModuleContributions<Tx, Access> {
    readonly http?: Contribution<any, readonly RouteFor<Tx, Access>[], any, any>;
    readonly sockets?: Contribution<any, readonly SocketSpec[], any, any>;
    readonly tasks?: Contribution<any, readonly WorkerTaskSpec[], any, any>;
    readonly jobs?: Contribution<any, readonly JobHandlerSpec[], any, any>;
    readonly consumers?: Contribution<any, readonly ConsumerSpec<Tx>[], any, any>;
}
export interface ModuleDefinition<Tx = unknown, Access = unknown, Contribs extends ModuleContributions<Tx, Access> = ModuleContributions<Tx, Access>, S extends Schema = Schema> extends CatalogContribution {
    readonly name: string;
    readonly schema?: S;
    readonly contributes: Contribs;
    /** Runs only when at least one contribution of the module is active in the process. */
    start?(signal: AbortSignal): Promise<void>;
    stop?(signal: AbortSignal): Promise<void>;
}
/** A wide (`any`) `Spec`, as in a module typed `ModuleDefinition<Tx, Access>`, demands nothing here; the boot check still applies. */
type RequiredServices<C> = C extends Contribution<infer Needs, unknown, infer Spec, unknown> ? 0 extends 1 & Spec ? never : {
    readonly [K in RequiredKeys<Spec>]: K extends keyof Needs ? Exclude<Needs[K], undefined> : unknown;
} : never;
type ModuleNeeds<M, Roles extends ProcessRole> = M extends {
    readonly contributes: infer C;
} ? Roles extends keyof C ? RequiredServices<NonNullable<C[Roles]>> : never : never;
type UnionToIntersection<U> = (U extends unknown ? (u: U) => void : never) extends (i: infer I) => void ? I : never;
/** Services the active `Roles` of `Mods` declare as 'required'; `unknown` when none. */
export type NeedsFor<Mods extends readonly ModuleDefinition<any, any, any, any>[], Roles extends ProcessRole> = UnionToIntersection<ModuleNeeds<Mods[number], Roles>>;
type SlotItem<M, Role extends ProcessRole> = M extends {
    readonly contributes: infer C;
} ? Role extends keyof C ? NonNullable<C[Role]> extends Contribution<infer _Needs, infer Out, infer _Spec, infer _Config> ? Out extends readonly (infer Item)[] ? Item : never : never : never : never;
/** Union of each module's own route type: no single process `Tx`/`Access` is imposed here. */
export type RoutesOf<Mods extends readonly ModuleDefinition<unknown, unknown>[]> = SlotItem<Mods[number], 'http'>;
/** Union of each module's own consumer type. */
export type ConsumersOf<Mods extends readonly ModuleDefinition<unknown, unknown>[]> = SlotItem<Mods[number], 'consumers'>;
/** Keys of `Needed` that `Services` lacks or provides with an incompatible type. */
export type MissingServiceKeys<Services, Needed> = {
    [K in keyof Needed]-?: K extends keyof Services ? (Services[K] extends Needed[K] ? never : K) : K;
}[keyof Needed];
/** Branded mismatch: the compiler prints the missing key names in the error. */
export interface MissingServicesError<Missing extends PropertyKey> {
    readonly __missingServices: Missing;
}
export type ServicesCheck<Services, Needed> = [MissingServiceKeys<Services, Needed>] extends [never] ? unknown : MissingServicesError<MissingServiceKeys<Services, Needed>>;
export {};
