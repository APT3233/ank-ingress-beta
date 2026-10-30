/** `true` for the defaults, or overrides per header name (`false` drops a default). */
export type SecurityHeadersOption = boolean | Readonly<Record<string, string | false>>;
export declare const DEFAULT_SECURITY_HEADERS: Readonly<Record<string, string>>;
export declare function compileSecurityHeaders(option: SecurityHeadersOption): Readonly<Record<string, string>> | null;
