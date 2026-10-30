import { buildCatalogs } from '@ank-ingress/contracts';
export function buildModuleCatalogs(defs, presetCatalogs) {
    const contribs = [...(presetCatalogs ?? [])];
    for (const mod of defs) {
        const c = {
            ...(mod.errorCodes ? { errorCodes: mod.errorCodes } : {}),
            ...(mod.permissions ? { permissions: mod.permissions } : {}),
            ...(mod.events ? { events: mod.events } : {}),
            ...(mod.dbErrorRules ? { dbErrorRules: mod.dbErrorRules } : {}),
        };
        contribs.push({ owner: mod.name, c });
    }
    return buildCatalogs(contribs);
}
