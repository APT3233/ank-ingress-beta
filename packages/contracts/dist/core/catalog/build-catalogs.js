import { CompositionError, isValidErrorCodeFormat } from '@ank-ingress/kernel';
import { EVENT_TYPE_FORMAT, PERMISSION_CODE_FORMAT } from "./catalog-formats.js";
export function buildCatalogs(contribs) {
    const errorMap = new Map();
    const permMap = new Map();
    const eventMap = new Map();
    const dbRuleOwners = new Map();
    const dbRules = [];
    for (const { owner, c } of contribs) {
        if (c.errorCodes) {
            for (const [code, spec] of Object.entries(c.errorCodes)) {
                if (!isValidErrorCodeFormat(code)) {
                    throw new CompositionError(`Invalid error code format "${code}" declared by "${owner}"`);
                }
                const existing = errorMap.get(code);
                if (existing) {
                    throw new CompositionError(`Duplicate error code "${code}" declared by both "${existing.owner}" and "${owner}"`);
                }
                errorMap.set(code, { owner, spec: Object.freeze({ ...spec }) });
            }
        }
        if (c.permissions) {
            for (const [code, spec] of Object.entries(c.permissions)) {
                if (!PERMISSION_CODE_FORMAT.test(code)) {
                    throw new CompositionError(`Invalid permission code "${code}" declared by "${owner}" (expected a:b(:c)*)`);
                }
                const existing = permMap.get(code);
                if (existing) {
                    throw new CompositionError(`Duplicate permission code "${code}" declared by both "${existing.owner}" and "${owner}"`);
                }
                permMap.set(code, {
                    owner,
                    spec: Object.freeze({
                        kind: spec.kind,
                        roles: Object.freeze([...spec.roles]),
                        ...(spec.attrs ? { attrs: Object.freeze({ ...spec.attrs }) } : {}),
                    }),
                });
            }
        }
        if (c.events) {
            for (const spec of c.events) {
                if (!EVENT_TYPE_FORMAT.test(spec.type)) {
                    throw new CompositionError(`Invalid event type "${spec.type}" declared by "${owner}"`);
                }
                const existing = eventMap.get(spec.type);
                if (existing) {
                    throw new CompositionError(`Duplicate event type "${spec.type}" declared by both "${existing.owner}" and "${owner}"`);
                }
                eventMap.set(spec.type, { owner, spec: Object.freeze({ ...spec }) });
            }
        }
        if (c.dbErrorRules) {
            for (const rule of c.dbErrorRules) {
                if (!rule.match.sqlstate && !rule.match.constraint) {
                    throw new CompositionError(`DbErrorRule declared by "${owner}" must specify sqlstate or constraint`);
                }
                const key = `${rule.match.sqlstate ?? '*'}::${rule.match.constraint ?? '*'}`;
                const existingOwner = dbRuleOwners.get(key);
                if (existingOwner) {
                    throw new CompositionError(`Duplicate DbErrorRule "${key}" declared by both "${existingOwner}" and "${owner}"`);
                }
                dbRuleOwners.set(key, owner);
                dbRules.push(Object.freeze({
                    match: Object.freeze({ ...rule.match }),
                    code: rule.code,
                    ...(rule.retryable === undefined ? {} : { retryable: rule.retryable }),
                }));
            }
        }
    }
    const frozenErrors = new Map();
    for (const [k, v] of errorMap)
        frozenErrors.set(k, v.spec);
    const frozenPerms = new Map();
    for (const [k, v] of permMap)
        frozenPerms.set(k, v.spec);
    const frozenEvents = new Map();
    for (const [k, v] of eventMap)
        frozenEvents.set(k, v.spec);
    const frozenDbRules = Object.freeze(dbRules);
    const fallbackInternal = frozenErrors.get('COMMON-500-INTERNAL')?.message ?? 'Internal server error';
    return Object.freeze({
        errors: Object.freeze({
            has: (code) => frozenErrors.has(code),
            message: (code) => frozenErrors.get(code)?.message ?? fallbackInternal,
            entries: () => frozenErrors,
        }),
        permissions: Object.freeze({
            get: (code) => frozenPerms.get(code),
            entries: () => frozenPerms,
        }),
        events: Object.freeze({
            spec: (type) => frozenEvents.get(type),
            entries: () => frozenEvents,
        }),
        dbErrors: Object.freeze({
            resolve: (sqlstate, constraint) => {
                for (const r of frozenDbRules) {
                    if (r.match.constraint !== undefined && r.match.sqlstate !== undefined) {
                        if (r.match.constraint === constraint && r.match.sqlstate === sqlstate)
                            return r;
                    }
                }
                for (const r of frozenDbRules) {
                    if (r.match.constraint !== undefined && r.match.sqlstate === undefined) {
                        if (r.match.constraint === constraint)
                            return r;
                    }
                }
                for (const r of frozenDbRules) {
                    if (r.match.sqlstate !== undefined && r.match.constraint === undefined) {
                        if (r.match.sqlstate === sqlstate)
                            return r;
                    }
                }
                return undefined;
            },
            rules: () => frozenDbRules,
        }),
    });
}
