/** SIGTERM/SIGINT handling: log, drain via `close`, then exit (code 1 if the drain timed out or failed). */
export function createSignalShutdown(appLogger, handleSignals, close) {
    // Handlers are removed as soon as closing starts, so a second signal falls back to Node's default termination.
    const onSignal = (signal) => {
        appLogger.info('shutdown.signal', { signal });
        const drainSignal = AbortSignal.timeout(typeof handleSignals === 'object' ? handleSignals.timeoutMs ?? 25_000 : 25_000);
        void close(drainSignal).then(() => process.exit(drainSignal.aborted ? 1 : 0), () => process.exit(1));
    };
    return {
        install() {
            process.on('SIGTERM', onSignal);
            process.on('SIGINT', onSignal);
        },
        remove() {
            process.off('SIGTERM', onSignal);
            process.off('SIGINT', onSignal);
        },
    };
}
