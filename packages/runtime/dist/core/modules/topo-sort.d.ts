export interface NamedNode {
    readonly name: string;
    readonly requires: readonly string[];
}
export declare function topoSortModules<T extends NamedNode>(defs: readonly T[]): T[];
