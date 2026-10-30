export declare function weakEtag(payload: string): string;
/** Weak comparison per RFC 9110: `*` or any listed tag equal after dropping `W/`. */
export declare function ifNoneMatchHits(header: string | undefined, etag: string): boolean;
