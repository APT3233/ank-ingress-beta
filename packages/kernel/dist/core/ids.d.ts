declare const intIdBrand: unique symbol;
declare const bigIntIdBrand: unique symbol;
declare const uuidBrand: unique symbol;
export type IntId = number & {
    readonly [intIdBrand]: true;
};
export type BigIntId = string & {
    readonly [bigIntIdBrand]: true;
};
export type Uuid = string & {
    readonly [uuidBrand]: true;
};
export declare function parseIntId(input: unknown, field?: string): IntId;
export declare function parseBigIntId(input: unknown, field?: string): BigIntId;
export declare function parseUuid(input: unknown, field?: string): Uuid;
export declare function newUuid(): Uuid;
export {};
