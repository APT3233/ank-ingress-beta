declare const timestampBrand: unique symbol;
declare const businessDateBrand: unique symbol;
export type IsoTimestamp = string & {
    readonly [timestampBrand]: true;
};
export type BusinessDate = string & {
    readonly [businessDateBrand]: true;
};
export declare function toIsoTimestamp(date: Date): IsoTimestamp;
export declare function parseIsoTimestamp(input: unknown, field?: string): IsoTimestamp;
export declare function parseBusinessDate(input: unknown, field?: string): BusinessDate;
export declare function isTimeZone(timeZone: string): boolean;
export declare function businessDateInZone(instant: Date, timeZone: string): BusinessDate;
export {};
