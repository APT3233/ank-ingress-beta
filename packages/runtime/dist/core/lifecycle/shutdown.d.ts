import type { HealthServer, Logger, ReadinessState } from '@ank-ingress/observability';
import type { Inbound, Resource } from '../../types/lifecycle.types.js';
import type { RuntimeConfig } from './runtime-config.js';
export interface ShutdownState {
    logger: Logger;
    rt: RuntimeConfig | undefined;
    state: ReadinessState;
    inbound: Inbound | undefined;
    inboundStarted: boolean;
    health: HealthServer | undefined;
    monitor: ReturnType<typeof setInterval> | undefined;
    shuttingDown: Promise<void> | undefined;
    bootSettled: boolean;
    bootTask: Promise<void>;
    readonly resources: Resource[];
    readonly moduleStops: Array<(signal: AbortSignal) => Promise<void> | void>;
    readonly checkControllers: Set<AbortController>;
    readonly bootAbort: AbortController;
    readonly done: Promise<number>;
    setState: (next: ReadinessState, reason?: string) => void;
    finish: (code: number) => void;
}
export declare function createShutdown(proc: ShutdownState): (reason: string, timeoutMs: number, exitCode: number) => Promise<void>;
