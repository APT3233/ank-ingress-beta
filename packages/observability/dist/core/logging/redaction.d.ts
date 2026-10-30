export declare const SENSITIVE_KEYS: Set<string>;
export declare function isSensitiveKey(k: string): boolean;
export declare function sanitizeLogValue(value: unknown, depth?: number): unknown;
