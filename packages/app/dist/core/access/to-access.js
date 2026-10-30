export function toAccess(access, scopeParam) {
    if (access === 'public')
        return { kind: 'public' };
    if (access === 'authenticated')
        return { kind: 'authenticated' };
    return scopeParam === undefined
        ? { kind: 'permission', code: access }
        : { kind: 'permission', code: access, scopeParam };
}
