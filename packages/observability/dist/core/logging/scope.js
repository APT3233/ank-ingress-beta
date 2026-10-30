import { AsyncLocalStorage } from 'node:async_hooks';
export const requestScope = new AsyncLocalStorage();
let activeSyncScope;
export function enterSyncScope(scope) {
    const prev = activeSyncScope;
    activeSyncScope = scope;
    return prev;
}
export function exitSyncScope(prev) {
    activeSyncScope = prev;
}
export function runWithSyncScope(scope, fn) {
    const prev = activeSyncScope;
    activeSyncScope = scope;
    try {
        return fn();
    }
    finally {
        activeSyncScope = prev;
    }
}
export function runInScope(scope, fn) {
    const parent = activeSyncScope ?? requestScope.getStore();
    if (parent === undefined) {
        return requestScope.run(scope, fn);
    }
    const merged = Object.create(parent);
    Object.defineProperties(merged, Object.getOwnPropertyDescriptors(scope));
    return requestScope.run(merged, fn);
}
export function currentScope() {
    return activeSyncScope ?? requestScope.getStore();
}
