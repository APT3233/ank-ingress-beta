export async function sleep(ms, signal) {
    if (ms <= 0)
        return;
    await new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }
        let timer;
        const onAbort = () => {
            if (timer)
                clearTimeout(timer);
            reject(signal?.reason);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
    });
}
export async function retryUntilSuccess(attempt, options) {
    let n = 0;
    for (;;) {
        options.signal.throwIfAborted();
        n += 1;
        try {
            return await attempt();
        }
        catch (err) {
            if (!options.shouldRetry(err) || options.signal.aborted)
                throw err;
            const cap = Math.min(10_000, 100 * 2 ** Math.min(n, 7));
            const delayMs = Math.max(25, Math.floor(Math.random() * cap));
            options.onFailure?.(err, n, delayMs);
            await sleep(delayMs, options.signal);
        }
    }
}
