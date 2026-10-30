declare const decimalBrand: unique symbol;
export type DecimalString = string & {
    readonly [decimalBrand]: true;
};
export interface DecimalKind {
    readonly name: string;
    readonly maxScale: number;
    readonly maxIntegerDigits: number;
}
export declare const QUANTITY: DecimalKind;
export declare const COEFFICIENT: DecimalKind;
export interface ParseDecimalOptions {
    readonly field?: string;
    readonly allowNegative?: boolean;
}
export declare function parseDecimal(input: unknown, kind: DecimalKind, options?: ParseDecimalOptions): DecimalString;
export declare function parseQuantity(input: unknown, options?: ParseDecimalOptions): DecimalString;
export declare function parseCoefficient(input: unknown, options?: ParseDecimalOptions): DecimalString;
export {};
