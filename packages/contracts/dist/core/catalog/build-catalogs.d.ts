import type { CatalogContribution, Catalogs } from '../../types/catalog.types.js';
export interface OwnedContribution {
    readonly owner: string;
    readonly c: CatalogContribution;
}
export declare function buildCatalogs(contribs: readonly OwnedContribution[]): Catalogs;
