export declare const EXIT: Readonly<{
    OK: 0;
    FAILURE: 1;
    CONFIG: 78;
}>;
export declare class StartupError extends Error {
    readonly exitCode: 78;
    constructor(message: string, options?: {
        readonly cause?: unknown;
    });
}
export declare function exitCodeOf(error: unknown): number;
