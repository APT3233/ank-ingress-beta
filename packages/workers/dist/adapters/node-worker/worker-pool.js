import { Worker } from 'node:worker_threads';
import { AppError } from '@ank-ingress/kernel';
import { preparePayloadAndTransfer } from "./payload-transfer.js";
const ENTRY_URL = new URL('./worker-entry.js', import.meta.url);
const MAX_RESPAWN_CAP_MS = 5_000;
export class WorkerPool {
    size;
    maxQueue;
    tasks;
    maxOldGenerationSizeMb;
    defaultTimeoutMs;
    backoffBaseMs;
    backoffCapMs;
    queueDepthGauge;
    restartsCounter;
    taskDurationHist;
    workers = new Set();
    respawnTimers = new Set();
    queue = [];
    drainWaiters = new Set();
    nextTaskId = 1;
    consecutiveCrashes = 0;
    draining = false;
    closed = false;
    constructor(options) {
        this.size = Math.max(1, options.size);
        this.maxQueue = Math.max(0, options.maxQueue);
        this.tasks = [...options.tasks];
        this.maxOldGenerationSizeMb = options.maxOldGenerationSizeMb;
        this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
        this.backoffBaseMs = options.respawnBackoff?.baseMs ?? 100;
        this.backoffCapMs = Math.min(MAX_RESPAWN_CAP_MS, options.respawnBackoff?.capMs ?? MAX_RESPAWN_CAP_MS);
        if (options.metrics) {
            this.queueDepthGauge = options.metrics
                .gauge('ank_worker_queue_depth', 'Queued tasks waiting for a worker thread')
                .bind();
            this.restartsCounter = options.metrics
                .counter('ank_worker_restarts_total', 'Total worker thread restarts after crash/timeout')
                .bind();
            this.taskDurationHist = options.metrics.histogram('ank_worker_task_seconds', 'Worker task execution time in seconds', ['task']);
        }
        for (let i = 0; i < this.size; i++) {
            this.spawnWorker();
        }
    }
    get activeWorkers() {
        return this.workers.size;
    }
    get replacingWorkers() {
        return this.respawnTimers.size;
    }
    get queueDepth() {
        return this.queue.length;
    }
    updateQueueGauge() {
        this.queueDepthGauge?.set(this.queue.length);
    }
    scheduleRespawn() {
        if (this.closed)
            return;
        if (this.workers.size + this.respawnTimers.size >= this.size)
            return;
        this.restartsCounter?.inc();
        this.consecutiveCrashes += 1;
        const rawExp = this.consecutiveCrashes <= 1
            ? 0
            : Math.min(this.backoffCapMs, this.backoffBaseMs * 2 ** (this.consecutiveCrashes - 2));
        const delayMs = rawExp === 0
            ? 0
            : Math.min(this.backoffCapMs, Math.floor(rawExp * (0.75 + Math.random() * 0.25)));
        if (delayMs === 0) {
            this.spawnWorker();
        }
        else {
            const timer = setTimeout(() => {
                this.respawnTimers.delete(timer);
                this.spawnWorker();
            }, delayMs);
            timer.unref?.();
            this.respawnTimers.add(timer);
        }
    }
    spawnWorker() {
        if (this.closed || this.workers.size >= this.size)
            return;
        const worker = new Worker(ENTRY_URL, {
            workerData: { tasks: this.tasks },
            ...(this.maxOldGenerationSizeMb
                ? { resourceLimits: { maxOldGenerationSizeMb: this.maxOldGenerationSizeMb } }
                : {}),
        });
        const managed = {
            worker,
            ready: false,
            busy: false,
            currentTask: null,
            startedAt: 0,
            timer: null,
            terminatedByPool: false,
        };
        this.workers.add(managed);
        worker.on('message', (msg) => {
            if (msg.ready) {
                managed.ready = true;
                this.dispatch();
                return;
            }
            const active = managed.currentTask;
            if (!active || active.id !== msg.id)
                return;
            if (managed.timer) {
                clearTimeout(managed.timer);
                managed.timer = null;
            }
            const elapsedSec = (performance.now() - managed.startedAt) / 1000;
            this.taskDurationHist?.observe({ task: active.task }, elapsedSec);
            managed.currentTask = null;
            managed.busy = false;
            this.consecutiveCrashes = 0;
            if (msg.ok) {
                active.resolve(msg.result);
            }
            else {
                active.reject(new AppError('COMMON-500-INTERNAL', {
                    message: msg.error?.message ?? 'Worker task failed',
                }));
            }
            this.dispatch();
            this.checkDrainIdle();
        });
        const handleCrash = (errOrCode) => {
            if (!this.workers.has(managed))
                return;
            this.workers.delete(managed);
            if (managed.timer) {
                clearTimeout(managed.timer);
                managed.timer = null;
            }
            const active = managed.currentTask;
            managed.currentTask = null;
            managed.busy = false;
            if (!this.closed) {
                this.scheduleRespawn();
            }
            if (active && !managed.terminatedByPool) {
                const detail = errOrCode instanceof Error ? errOrCode.message : `Worker exited (${String(errOrCode)})`;
                active.reject(new AppError('COMMON-500-INTERNAL', {
                    message: detail,
                    cause: errOrCode,
                }));
            }
            this.dispatch();
            this.checkDrainIdle();
        };
        worker.on('error', (err) => handleCrash(err));
        worker.on('exit', (code) => handleCrash(code));
    }
    dispatch() {
        if (this.closed || this.queue.length === 0)
            return;
        for (const managed of this.workers) {
            while (managed.ready && !managed.busy && this.queue.length > 0) {
                const next = this.queue.shift();
                if (!next)
                    break;
                this.updateQueueGauge();
                if (next.onAbort && next.signal) {
                    next.signal.removeEventListener('abort', next.onAbort);
                }
                if (next.signal?.aborted) {
                    next.reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Worker task aborted while queued' }));
                    continue;
                }
                let prepared;
                try {
                    prepared = preparePayloadAndTransfer(next.payload, next.transfer);
                }
                catch (err) {
                    next.reject(new AppError('COMMON-500-INTERNAL', {
                        message: err instanceof Error ? err.message : String(err), cause: err,
                    }));
                    this.checkDrainIdle();
                    continue;
                }
                managed.busy = true;
                managed.currentTask = next;
                managed.startedAt = performance.now();
                managed.timer = setTimeout(() => {
                    managed.timer = null;
                    managed.terminatedByPool = true;
                    const timedOutTask = managed.currentTask;
                    managed.currentTask = null;
                    managed.busy = false;
                    this.workers.delete(managed);
                    if (!this.closed) {
                        this.scheduleRespawn();
                    }
                    void managed.worker.terminate();
                    timedOutTask?.reject(new AppError('COMMON-503-UNAVAILABLE', {
                        message: `Worker task "${next.task}" timed out after ${next.timeoutMs}ms`,
                    }));
                    this.checkDrainIdle();
                }, next.timeoutMs);
                const message = { id: next.id, task: next.task, payload: prepared.payload };
                try {
                    if (prepared.transfer.length > 0) {
                        try {
                            managed.worker.postMessage(message, prepared.transfer);
                        }
                        catch {
                            // If transfer failed on a deeply nested untransferable ArrayBuffer, fall back to structured clone
                            managed.worker.postMessage({ id: next.id, task: next.task, payload: next.payload });
                        }
                    }
                    else {
                        managed.worker.postMessage(message);
                    }
                }
                catch (err) {
                    if (managed.timer) {
                        clearTimeout(managed.timer);
                        managed.timer = null;
                    }
                    managed.currentTask = null;
                    managed.busy = false;
                    next.reject(new AppError('COMMON-500-INTERNAL', {
                        message: err instanceof Error ? err.message : String(err),
                        cause: err,
                    }));
                    this.checkDrainIdle();
                    continue;
                }
            }
        }
    }
    isIdle() {
        if (this.queue.length > 0)
            return false;
        for (const w of this.workers) {
            if (w.busy)
                return false;
        }
        return true;
    }
    checkDrainIdle() {
        if (this.drainWaiters.size > 0 && this.isIdle()) {
            for (const notify of [...this.drainWaiters]) {
                this.drainWaiters.delete(notify);
                notify();
            }
        }
    }
    run(task, payload, options = {}) {
        if (this.draining || this.closed) {
            return Promise.reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Worker pool is draining or closed' }));
        }
        if (options.signal?.aborted) {
            return Promise.reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Worker task aborted before queueing' }));
        }
        // Check if an idle ready worker is available right now
        let hasIdleReady = false;
        for (const w of this.workers) {
            if (w.ready && !w.busy) {
                hasIdleReady = true;
                break;
            }
        }
        if (!hasIdleReady && this.queue.length >= this.maxQueue) {
            return Promise.reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Worker pool queue full' }));
        }
        return new Promise((resolve, reject) => {
            const id = this.nextTaskId++;
            const item = {
                id,
                task,
                payload,
                transfer: options.transfer,
                timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs,
                signal: options.signal,
                resolve: resolve,
                reject,
            };
            if (options.signal) {
                const onAbort = () => {
                    const idx = this.queue.indexOf(item);
                    if (idx !== -1) {
                        this.queue.splice(idx, 1);
                        this.updateQueueGauge();
                        reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Worker task aborted in queue' }));
                        this.checkDrainIdle();
                    }
                };
                item.onAbort = onAbort;
                options.signal.addEventListener('abort', onAbort, { once: true });
            }
            this.queue.push(item);
            this.updateQueueGauge();
            this.dispatch();
        });
    }
    async drain(signal) {
        this.draining = true;
        if (this.isIdle() || signal.aborted)
            return;
        await new Promise((resolve) => {
            const done = () => {
                this.drainWaiters.delete(done);
                signal.removeEventListener('abort', done);
                resolve();
            };
            this.drainWaiters.add(done);
            signal.addEventListener('abort', done, { once: true });
        });
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.draining = true;
        for (const timer of this.respawnTimers) {
            clearTimeout(timer);
        }
        this.respawnTimers.clear();
        while (this.queue.length > 0) {
            const item = this.queue.shift();
            item.reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Worker pool closed' }));
        }
        this.updateQueueGauge();
        const termPromises = [];
        for (const managed of [...this.workers]) {
            this.workers.delete(managed);
            managed.terminatedByPool = true;
            if (managed.timer) {
                clearTimeout(managed.timer);
                managed.timer = null;
            }
            if (managed.currentTask) {
                managed.currentTask.reject(new AppError('COMMON-503-UNAVAILABLE', { message: 'Worker pool closed' }));
                managed.currentTask = null;
            }
            termPromises.push(managed.worker.terminate());
        }
        await Promise.allSettled(termPromises);
        this.checkDrainIdle();
    }
}
