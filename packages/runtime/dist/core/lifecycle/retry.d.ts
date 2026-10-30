export declare function sleep(ms: number, signal?: AbortSignal): Promise<void>;
export declare function retryUntilSuccess<T>(attempt: () => Promise<T>, options: {
    readonly signal: AbortSignal;
    readonly shouldRetry: (err: unknown) => boolean;
    readonly onFailure?: (err: unknown, attempt: number, delayMs: number) => void;
}): Promise<T>;
