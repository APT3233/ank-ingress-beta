import type { RevocationState } from '@ank-ingress/contracts';
export interface CacheEntry {
    readonly state: RevocationState;
    readonly expiresAtMs: number;
    readonly sub: string;
    readonly sid: string | null;
}
export interface EntryStore {
    get(jti: string): CacheEntry | undefined;
    set(jti: string, entry: CacheEntry): void;
    delete(jti: string): boolean;
    touch(jti: string, entry: CacheEntry): void;
    clear(): void;
    jtisBySub(sub: string): ReadonlySet<string> | undefined;
    jtisBySid(sid: string): ReadonlySet<string> | undefined;
}
export declare function createEntryStore(maxEntries: number): EntryStore;
