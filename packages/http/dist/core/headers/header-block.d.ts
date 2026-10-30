/**
 * Static headers joined into one uWS `writeHeader` call. uWS writes `name: value\r\n` verbatim, so
 * `value` carries the remaining `\r\nname: value` lines; built only from validated, compile-time strings.
 */
export interface HeaderBlock {
    readonly name: string;
    readonly value: string;
}
/** `\r\nname: value` for every pair in a flat `[name, value, ...]` list. */
export declare function headerLines(flat: readonly string[], from?: number): string;
export declare function isHeaderName(name: string): boolean;
export declare function toHeaderBlock(flat: readonly string[]): HeaderBlock | null;
