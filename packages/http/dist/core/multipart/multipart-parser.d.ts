import { type MultipartPartInfo } from './part-headers.js';
export interface MultipartEvents {
    partBegin(info: MultipartPartInfo): void;
    /** `chunk` may be a view into a larger buffer; it is never written to afterwards. */
    partData(chunk: Buffer): void;
    partEnd(): void;
}
export interface MultipartParserLimits {
    readonly maxParts: number;
    readonly maxHeaderBytes: number;
}
/**
 * Incremental `multipart/form-data` parser (RFC 7578). Delimiters are found with `Buffer.indexOf`;
 * part bytes are emitted as views of the input, and only a partial delimiter at a chunk edge is carried over.
 */
export declare class MultipartParser {
    private readonly delimiter;
    private readonly limits;
    private readonly events;
    private state;
    private carry;
    private parts;
    constructor(boundary: string, limits: MultipartParserLimits, events: MultipartEvents);
    get done(): boolean;
    write(chunk: Buffer): void;
    /** Call when the request body ended; fails if the closing boundary never arrived. */
    finish(): void;
    /** Length of `buf` that is certainly data: everything before a trailing partial delimiter. */
    private partialDelimiterAt;
}
