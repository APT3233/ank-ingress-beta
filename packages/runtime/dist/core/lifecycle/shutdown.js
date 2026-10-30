import { EXIT } from "./exit.js";
import { sleep } from "./retry.js";
export function createShutdown(proc) {
    return async function shutdown(reason, timeoutMs, exitCode) {
        if (proc.shuttingDown !== undefined)
            return proc.shuttingDown;
        proc.shuttingDown = (async () => {
            const t0 = Date.now();
            const deadline = t0 + timeoutMs;
            let step = 'drain-start';
            const timer = setTimeout(() => {
                proc.logger.error('shutdown.timeout', { reason, step, timeoutMs });
                proc.finish(EXIT.FAILURE);
            }, timeoutMs);
            let code = exitCode;
            const run = async (name, fn) => {
                step = name;
                try {
                    await fn();
                }
                catch (error) {
                    code = EXIT.FAILURE;
                    proc.logger.error('shutdown.step_failed', {
                        step: name,
                        detail: error instanceof Error ? error.message : String(error),
                    });
                }
            };
            proc.logger.info('shutdown.begin', { reason });
            proc.setState('DRAINING', reason);
            if (proc.monitor !== undefined)
                clearInterval(proc.monitor);
            proc.bootAbort.abort(new Error(`shutdown: ${reason}`));
            for (const controller of proc.checkControllers)
                controller.abort(proc.bootAbort.signal.reason);
            if (!proc.bootSettled) {
                let bootTimer;
                const settled = await Promise.race([
                    proc.bootTask.then(() => true, () => true),
                    new Promise((resolve) => {
                        bootTimer = setTimeout(() => resolve(false), Math.max(100, Math.min(2_000, Math.floor(timeoutMs / 5))));
                    }),
                ]);
                clearTimeout(bootTimer);
                if (!settled) {
                    code = EXIT.FAILURE;
                    proc.logger.warn('shutdown.boot_detached', { reason });
                }
            }
            if (proc.inbound !== undefined && proc.inboundStarted) {
                const delay = exitCode === EXIT.OK ? (proc.rt?.shutdownDelayMs ?? 0) : 0;
                if (delay > 0)
                    await run('delay', () => sleep(delay));
                const current = proc.inbound;
                await run('stop', () => current.stop());
                const reserve = Math.min(5_000, Math.floor(timeoutMs / 5));
                const drainAbort = new AbortController();
                const drainTimer = setTimeout(() => drainAbort.abort(new Error('drain deadline')), Math.max(0, deadline - reserve - Date.now()));
                await run('drain', () => current.drain(drainAbort.signal));
                clearTimeout(drainTimer);
                if (drainAbort.signal.aborted)
                    code = EXIT.FAILURE;
                await run('release', () => current.release?.());
            }
            for (const stopModules of [...proc.moduleStops].reverse()) {
                const modStopAbort = new AbortController();
                const modStopTimer = setTimeout(() => modStopAbort.abort(new Error('module stop deadline')), Math.max(0, deadline - Date.now()));
                try {
                    await run('close:modules', () => stopModules(modStopAbort.signal));
                }
                finally {
                    clearTimeout(modStopTimer);
                }
            }
            for (const r of [...proc.resources].reverse()) {
                await run(`close:${r.name}`, () => r.close());
            }
            await run('health', () => proc.health?.close());
            proc.setState('STOPPED', reason);
            proc.logger.info('shutdown.done', { reason, durationMs: Date.now() - t0, exitCode: code });
            await run('logger:flush', () => proc.logger.flush());
            clearTimeout(timer);
            proc.finish(code);
        })();
        proc.shuttingDown = Promise.race([proc.shuttingDown, proc.done.then(() => { })]);
        return proc.shuttingDown;
    };
}
