/** Client correlation ids are echoed into a response header, so accept only 1–64 visible ASCII chars. */
export declare function isSafeCorrelationId(value: string): boolean;
export declare function nextFastUuid(): string;
