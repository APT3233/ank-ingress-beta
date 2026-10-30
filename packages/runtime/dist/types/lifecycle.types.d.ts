import type { ConfigOf, Schema } from '@ank-ingress/config';
import type { HealthSnapshot, Logger, MetricsRegistry, ReadinessState } from '@ank-ingress/observability';
export interface Resource {
    readonly name: string;
    readonly required: boolean;
    check(signal: AbortSignal): Promise<void>;
    close(): Promise<void>;
}
export interface Inbound {
    start(): Promise<void>;
    pause?(): Promise<void> | void;
    resume?(): Promise<void> | void;
    stop(): Promise<void>;
    drain(signal: AbortSignal): Promise<void>;
    release?(): Promise<void>;
}
export interface BootContext {
    readonly app: string;
    readonly instanceId: string;
    readonly logger: Logger;
    readonly metrics: MetricsRegistry;
    readonly signal: AbortSignal;
    status(): ReadinessState;
    use<R extends Resource>(resource: R): R;
    onStopModules?(fn: (signal: AbortSignal) => Promise<void> | void): void;
    waitFor<T>(what: string, attempt: () => Promise<T>): Promise<T>;
    phase<T>(name: string, fn: () => Promise<T>): Promise<T>;
}
export interface ProcessDefinition<S extends Schema> {
    readonly app: string;
    readonly schema: S;
    boot(ctx: BootContext, config: ConfigOf<S>): Promise<Inbound>;
}
export interface RuntimeHost {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly hostname: string;
    readonly pid: number;
    readonly nodeVersion: string;
    onSignal(signal: 'SIGTERM' | 'SIGINT', handler: () => void): void;
    onFatal(handler: (error: unknown) => void): void;
    exit(code: number): void;
    readonly random?: () => number;
}
export interface RuntimeHandle {
    report(): HealthSnapshot;
    shutdown(reason?: string): Promise<void>;
    readonly done: Promise<number>;
}
