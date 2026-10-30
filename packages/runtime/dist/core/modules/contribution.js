/**
 * The only way to create a module contribution. Fix the service types (`Needs`) and the module's config type first;
 * `build` then sees 'required' services as `T` and 'optional' ones as `T | undefined`.
 */
export function contribution() {
    return function create(def) {
        // The brand is type-only; this is the single place that mints it, after `def` was checked against `Needs`.
        return Object.freeze({ needs: def.needs, build: def.build });
    };
}
