export function createWorkTracker() {
    let active = 0;
    const waiters = new Set();
    const dec = () => {
        if (active <= 0)
            return;
        active -= 1;
        if (active === 0 && waiters.size > 0) {
            for (const notify of [...waiters]) {
                waiters.delete(notify);
                notify();
            }
        }
    };
    return {
        inc() {
            active += 1;
        },
        dec,
        enter() {
            active += 1;
            let exited = false;
            return () => {
                if (exited)
                    return;
                exited = true;
                dec();
            };
        },
        get count() {
            return active;
        },
        idle(signal) {
            if (active === 0 || signal.aborted) {
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                const done = () => {
                    waiters.delete(done);
                    signal.removeEventListener('abort', done);
                    resolve();
                };
                waiters.add(done);
                signal.addEventListener('abort', done, { once: true });
            });
        },
    };
}
