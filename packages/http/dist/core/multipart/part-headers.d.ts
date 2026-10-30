import { AppError } from '@ank-ingress/kernel';
export interface MultipartPartInfo {
    readonly name: string;
    readonly filename: string | null;
    readonly contentType: string;
}
export declare function invalid(message: string): AppError;
/** Splits `a=1; b="x;y"` style parameters, honouring quoted strings and backslash escapes. */
export declare function parseParams(value: string): Map<string, string>;
export declare function decodeExtValue(value: string): string | null;
export declare function parsePartHeaders(block: string): MultipartPartInfo;
