/** Fix the process `Tx`/`Access` first, then let each contribution keep its own literal `needs` and `build` types. */
export function defineModule() {
    return (def) => Object.freeze({ ...def, contributes: Object.freeze({ ...def.contributes }) });
}
