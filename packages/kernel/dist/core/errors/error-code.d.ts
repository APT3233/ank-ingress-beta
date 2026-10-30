import type { ErrorCategory } from '../../types/error.types.js';
export declare const CODE_FORMAT: RegExp;
export declare const CATEGORY_BY_STATUS: Readonly<Record<number, ErrorCategory>>;
export declare function isValidErrorCodeFormat(code: string): boolean;
