import type { Contribution, ContributionContext, NeedSpec, ServicesFor } from '../../types/module.types.js';
export interface ContributionInput<Needs, Out, Spec extends NeedSpec<Needs>, Config> {
    readonly needs: Spec;
    build(ctx: ContributionContext<ServicesFor<Needs, Spec>, Config>): Out | Promise<Out>;
}
/**
 * The only way to create a module contribution. Fix the service types (`Needs`) and the module's config type first;
 * `build` then sees 'required' services as `T` and 'optional' ones as `T | undefined`.
 */
export declare function contribution<Needs, Config = Readonly<Record<string, unknown>>>(): <const Spec extends NeedSpec<Needs>, Out>(def: ContributionInput<Needs, Out, Spec, Config>) => Contribution<Needs, Out, Spec, Config>;
