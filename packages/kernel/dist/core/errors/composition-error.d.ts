/**
 * Thrown during boot/composition when module definitions, routes, or catalogs conflict.
 * Exits with code 78 (EX_CONFIG) so process supervisors do not enter crash loops.
 */
export declare class CompositionError extends Error {
    readonly exitCode = 78;
    constructor(message: string);
}
