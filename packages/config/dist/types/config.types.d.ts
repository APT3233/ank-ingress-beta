export interface SecretHolder {
    current(): string;
    reload(): Promise<string>;
    watch(): () => void;
}
export interface FieldReadContext {
    readonly filePath?: string;
}
export interface Field<T> {
    readonly env: string;
    readonly secret: boolean;
    readonly read: (raw: string | undefined, ctx?: FieldReadContext) => T;
}
export type Schema = Readonly<Record<string, Field<unknown>>>;
export type ConfigOf<S extends Schema> = {
    readonly [K in keyof S]: S[K] extends Field<infer T> ? T : never;
};
export interface LoadedConfig<S extends Schema> {
    readonly values: ConfigOf<S>;
    readonly redacted: Readonly<Record<string, string>>;
    readonly hash: string;
}
export interface LoadOptions {
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly readFile?: (path: string) => string;
}
