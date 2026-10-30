export declare class ConfigError extends Error {
    readonly exitCode = 78;
    readonly problems: readonly string[];
    constructor(problems: readonly string[]);
}
