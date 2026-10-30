export declare function normalizeIp(raw: string | undefined): string | null;
export declare function resolveClientIp(remoteAddress: string, xffHeader: string | undefined, trustedProxies: ReadonlySet<string>, trustUnixSocket: boolean): string | null;
/** Whether X-Forwarded-* headers from this peer may be believed. */
export declare function isTrustedPeer(remoteAddress: string, trustedProxies: ReadonlySet<string>, trustUnixSocket: boolean): boolean;
