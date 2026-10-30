import { type CatalogContribution, type Catalogs, type OwnedContribution } from '@ank-ingress/contracts';
export declare function buildModuleCatalogs(defs: readonly (CatalogContribution & {
    readonly name: string;
})[], presetCatalogs?: readonly OwnedContribution[]): Catalogs;
