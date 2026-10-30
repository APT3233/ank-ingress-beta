import type { Logger } from '@ank-ingress/observability';
export interface SignalShutdown {
    install(): void;
    remove(): void;
}
/** SIGTERM/SIGINT handling: log, drain via `close`, then exit (code 1 if the drain timed out or failed). */
export declare function createSignalShutdown(appLogger: Logger, handleSignals: boolean | {
    readonly timeoutMs?: number;
}, close: (drainSignal: AbortSignal) => Promise<void>): SignalShutdown;
