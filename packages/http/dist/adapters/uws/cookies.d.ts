/** Parses a Cookie header; the first occurrence of a name wins. */
export declare function parseCookieHeader(header: string | undefined): Readonly<Record<string, string>>;
