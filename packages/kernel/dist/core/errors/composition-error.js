/**
 * Thrown during boot/composition when module definitions, routes, or catalogs conflict.
 * Exits with code 78 (EX_CONFIG) so process supervisors do not enter crash loops.
 */
export class CompositionError extends Error {
    exitCode = 78;
    constructor(message) {
        super(message);
        this.name = 'CompositionError';
    }
}
