export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface Logger {
    debug(event: string, fields?: Readonly<Record<string, unknown>>): void;
    info(event: string, fields?: Readonly<Record<string, unknown>>): void;
    warn(event: string, fields?: Readonly<Record<string, unknown>>): void;
    error(event: string, fields?: Readonly<Record<string, unknown>>): void;
    fatal(event: string, fields?: Readonly<Record<string, unknown>>): void;
    child(bindings: Readonly<Record<string, unknown>>): Logger;
    flush(): Promise<void>;
}
