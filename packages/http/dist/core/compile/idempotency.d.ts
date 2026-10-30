export declare function checkIdempotencyHeader(mode: 'required' | 'optional' | undefined, headerValue: string | undefined): string | null;
export declare function computeIdempotencyRequestHash(method: string, concretePath: string, rawQuery: string, rawBody: Buffer): string;
