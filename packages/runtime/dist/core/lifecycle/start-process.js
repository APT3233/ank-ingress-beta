import { ConfigError, loadConfig } from '@ank-ingress/config';
import { createLogger, createMetricsRegistry, registerProcessMetrics, startHealthServer } from '@ank-ingress/observability';
import { EXIT, exitCodeOf } from "./exit.js";
import { sleep, retryUntilSuccess } from "./retry.js";
import { CHECK_TIMEOUT_MS, STATES, makeInstanceId, runtimeSchema } from "./runtime-config.js";
import { createShutdown } from "./shutdown.js";
export function startProcess(def, host) {
    const random = host.random ?? Math.random;
    const metrics = createMetricsRegistry();
    const procMetrics = registerProcessMetrics(metrics);
    const lifecycleGauge = metrics.gauge('ank_lifecycle_state', 'Current lifecycle state (1 = active)', ['app', 'state']);
    const depGauge = metrics.gauge('ank_dependency_up', 'Dependency health (1 = up, 0 = down)', ['app', 'dependency']);
    const phaseGauge = metrics.gauge('ank_startup_phase_seconds', 'Startup phase duration in seconds', ['app', 'phase']);
    const buildInfoGauge = metrics.gauge('ank_build_info', 'Build metadata', ['app', 'node']);
    const resources = [];
    const checks = new Map();
    const pendingChecks = new Map();
    let resolveDone = () => { };
    const done = new Promise((resolve) => {
        resolveDone = resolve;
    });
    let checking = false;
    let fatal = false;
    let finished = false;
    const proc = {
        logger: createLogger({ service: def.app }),
        rt: undefined,
        state: 'STARTING',
        inbound: undefined,
        inboundStarted: false,
        health: undefined,
        monitor: undefined,
        shuttingDown: undefined,
        bootSettled: false,
        bootTask: Promise.resolve(),
        resources,
        moduleStops: [],
        checkControllers: new Set(),
        bootAbort: new AbortController(),
        done,
        setState: () => { },
        finish: () => { },
    };
    const publishState = () => {
        for (const s of STATES) {
            lifecycleGauge.set({ app: def.app, state: s }, s === proc.state ? 1 : 0);
        }
    };
    const setState = (next, reason) => {
        if (proc.state === next)
            return;
        const from = proc.state;
        proc.state = next;
        publishState();
        proc.logger.info('state.change', { fromState: from, toState: next, ...(reason ? { reason } : {}) });
    };
    proc.setState = setState;
    const report = () => {
        const deps = {};
        for (const [name, c] of checks) {
            deps[name] = {
                state: c.ok ? 'UP' : c.required ? 'DOWN' : 'DEGRADED',
                latencyMs: c.latencyMs,
            };
        }
        return {
            state: proc.state,
            acceptingTraffic: !fatal && (proc.state === 'READY' || proc.state === 'DEGRADED'),
            dependencies: deps,
        };
    };
    const finish = (code) => {
        if (finished)
            return;
        finished = true;
        if (proc.monitor !== undefined)
            clearInterval(proc.monitor);
        procMetrics.close();
        setState('STOPPED', 'exit');
        void proc.health?.close().catch(() => { });
        host.exit(code);
        resolveDone(code);
    };
    proc.finish = finish;
    const recordCheck = (r, ok, latencyMs, error) => {
        const prev = checks.get(r.name);
        checks.set(r.name, { required: r.required, ok, latencyMs });
        depGauge.set({ app: def.app, dependency: r.name }, ok ? 1 : 0);
        if (prev !== undefined && prev.ok !== ok) {
            proc.logger[ok ? 'info' : 'warn'](ok ? 'dependency.up' : 'dependency.down', {
                dependency: r.name,
                required: r.required,
                ...(error instanceof Error ? { detail: error.message } : {}),
            });
        }
    };
    const checkAll = async () => {
        await Promise.all(resources.map(async (r) => {
            if (pendingChecks.has(r))
                return;
            const controller = new AbortController();
            proc.checkControllers.add(controller);
            const t0 = performance.now();
            const probe = Promise.resolve().then(() => r.check(controller.signal));
            pendingChecks.set(r, probe);
            const settled = () => {
                if (pendingChecks.get(r) === probe)
                    pendingChecks.delete(r);
            };
            void probe.then(settled, settled);
            let onAbort = () => { };
            const deadline = new Promise((_resolve, reject) => {
                onAbort = () => reject(controller.signal.reason);
                controller.signal.addEventListener('abort', onAbort, { once: true });
            });
            const timer = setTimeout(() => controller.abort(new Error(`Health check deadline: ${r.name}`)), CHECK_TIMEOUT_MS);
            try {
                await Promise.race([probe, deadline]);
                if (proc.shuttingDown === undefined)
                    recordCheck(r, true, Math.round(performance.now() - t0));
            }
            catch (error) {
                if (proc.shuttingDown === undefined)
                    recordCheck(r, false, Math.round(performance.now() - t0), error);
            }
            finally {
                clearTimeout(timer);
                controller.signal.removeEventListener('abort', onAbort);
                proc.checkControllers.delete(controller);
            }
        }));
    };
    const computeState = () => {
        const all = [...checks.values()];
        if (all.some((c) => c.required && !c.ok))
            return 'NOT_READY';
        return all.some((c) => !c.ok) ? 'DEGRADED' : 'READY';
    };
    const tick = async () => {
        if (checking || proc.shuttingDown !== undefined)
            return;
        checking = true;
        try {
            await checkAll();
            if (proc.shuttingDown !== undefined)
                return;
            const next = computeState();
            const wasNotReady = proc.state === 'NOT_READY';
            setState(next);
            if (next === 'NOT_READY' && !wasNotReady)
                await proc.inbound?.pause?.();
            if (next !== 'NOT_READY' && wasNotReady)
                await proc.inbound?.resume?.();
        }
        catch (error) {
            proc.logger.error('health.tick_failed', { err: error instanceof Error ? error.message : String(error) });
        }
        finally {
            checking = false;
        }
    };
    const ctx = (instanceId) => ({
        app: def.app,
        instanceId,
        get logger() {
            return proc.logger;
        },
        metrics,
        signal: proc.bootAbort.signal,
        use: (resource) => {
            if (proc.bootAbort.signal.aborted) {
                void Promise.resolve()
                    .then(() => resource.close())
                    .catch(() => { });
                throw proc.bootAbort.signal.reason;
            }
            if (!resources.includes(resource)) {
                resources.push(resource);
            }
            return resource;
        },
        onStopModules: (fn) => {
            if (proc.bootAbort.signal.aborted) {
                void Promise.resolve()
                    .then(() => fn(AbortSignal.timeout(5_000)))
                    .catch(() => { });
                throw proc.bootAbort.signal.reason;
            }
            proc.moduleStops.push(fn);
        },
        status: () => proc.state,
        waitFor: (what, attempt) => retryUntilSuccess(attempt, {
            signal: proc.bootAbort.signal,
            shouldRetry: (error) => typeof error?.exitCode !== 'number',
            onFailure: (error, n, delayMs) => proc.logger.warn('dependency.waiting', {
                dependency: what,
                attempt: n,
                retryInMs: delayMs,
                detail: error instanceof Error ? error.message : String(error),
            }),
        }),
        phase: async (name, fn) => {
            const t0 = performance.now();
            const result = await fn();
            const seconds = (performance.now() - t0) / 1000;
            phaseGauge.set({ app: def.app, phase: name }, seconds);
            proc.logger.info('boot.phase', { phase: name, durationMs: Math.round(seconds * 1000) });
            return result;
        },
    });
    const shutdown = createShutdown(proc);
    const onSignal = (signal) => {
        if (proc.shuttingDown !== undefined) {
            proc.logger.warn('shutdown.forced', { signal });
            finish(EXIT.FAILURE);
            return;
        }
        void shutdown(signal, proc.rt?.shutdownTimeoutMs ?? 25_000, EXIT.OK);
    };
    host.onSignal('SIGTERM', () => onSignal('SIGTERM'));
    host.onSignal('SIGINT', () => onSignal('SIGINT'));
    host.onFatal((error) => {
        fatal = true;
        proc.logger.fatal('process.fatal', { detail: error instanceof Error ? error.message : String(error) });
        void shutdown('fatal', proc.rt?.shutdownFatalTimeoutMs ?? 5_000, EXIT.FAILURE);
    });
    const bootTask = (async () => {
        publishState();
        const loaded = loadConfig({ ...runtimeSchema(def.app), ...def.schema }, { env: host.env });
        const values = loaded.values;
        proc.rt = values;
        const instanceId = values.instanceId ||
            makeInstanceId(host.hostname, host.pid, Math.floor(random() * 0x10000).toString(16).padStart(4, '0'));
        proc.logger = createLogger({
            service: def.app,
            instanceId,
            level: values.logLevel,
        });
        proc.logger.info('boot.config', { configHash: loaded.hash, config: loaded.redacted, node: host.nodeVersion });
        buildInfoGauge.set({ app: def.app, node: host.nodeVersion }, 1);
        proc.health = await startHealthServer({
            host: values.healthHost,
            port: values.healthPort,
            status: report,
            metrics,
        });
        proc.logger.info('health.listening', { host: proc.health.host, port: proc.health.port });
        proc.bootAbort.signal.throwIfAborted();
        if (values.startupJitterMs > 0) {
            await sleep(Math.floor(random() * values.startupJitterMs), proc.bootAbort.signal);
        }
        const t0 = performance.now();
        const c = ctx(instanceId);
        proc.inbound = await def.boot(c, values);
        let lateInboundClosed = false;
        const closeLateInbound = async () => {
            if (lateInboundClosed)
                return;
            lateInboundClosed = true;
            proc.inboundStarted = false;
            await proc.inbound?.stop();
            await proc.inbound?.drain(AbortSignal.abort(proc.bootAbort.signal.reason));
            await proc.inbound?.release?.();
        };
        try {
            if (proc.bootAbort.signal.aborted)
                await closeLateInbound();
            proc.bootAbort.signal.throwIfAborted();
            await checkAll();
            proc.bootAbort.signal.throwIfAborted();
            const initial = computeState();
            if (initial === 'NOT_READY') {
                await c.waitFor('required dependencies', async () => {
                    await checkAll();
                    if (computeState() === 'NOT_READY')
                        throw new Error('required dependencies not ready');
                });
            }
            await c.phase('inbound', () => proc.inbound.start());
            proc.inboundStarted = true;
            if (proc.bootAbort.signal.aborted)
                await closeLateInbound();
            proc.bootAbort.signal.throwIfAborted();
        }
        catch (err) {
            await closeLateInbound().catch(() => { });
            throw err;
        }
        setState(computeState());
        proc.monitor = setInterval(() => void tick(), values.checkIntervalMs);
        proc.logger.info('boot.ready', { toState: proc.state, durationMs: Math.round(performance.now() - t0) });
    })();
    proc.bootTask = bootTask;
    void bootTask.then(() => {
        proc.bootSettled = true;
    }, () => {
        proc.bootSettled = true;
    });
    bootTask.catch((error) => {
        if (proc.bootAbort.signal.aborted)
            return;
        const code = error instanceof ConfigError ? EXIT.CONFIG : exitCodeOf(error);
        if (error instanceof ConfigError)
            proc.logger.fatal('boot.config_invalid', { problems: error.problems });
        else
            proc.logger.fatal('boot.failed', { detail: error instanceof Error ? error.message : String(error), exitCode: code });
        void shutdown('boot_failed', proc.rt?.shutdownFatalTimeoutMs ?? 5_000, code);
    });
    return {
        report,
        shutdown: (reason = 'manual') => shutdown(reason, proc.rt?.shutdownTimeoutMs ?? 25_000, EXIT.OK),
        done,
    };
}
