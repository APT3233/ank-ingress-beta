import { type ConfigOf } from '@ank-ingress/config';
import type { ReadinessState } from '@ank-ingress/observability';
export declare const LOG_LEVELS: readonly ["debug", "info", "warn", "error", "fatal"];
export declare const STATES: readonly ReadinessState[];
export declare const CHECK_TIMEOUT_MS = 2000;
export declare const INSTANCE_ID_RE: RegExp;
export declare function makeInstanceId(hostname: string, pid: number, suffix: string): string;
export declare function runtimeSchema(app: string): {
    logLevel: import("@ank-ingress/config").Field<"error" | "debug" | "info" | "warn" | "fatal">;
    healthPort: import("@ank-ingress/config").Field<number>;
    healthHost: import("@ank-ingress/config").Field<string>;
    instanceId: import("@ank-ingress/config").Field<string>;
    shutdownDelayMs: import("@ank-ingress/config").Field<number>;
    shutdownTimeoutMs: import("@ank-ingress/config").Field<number>;
    shutdownFatalTimeoutMs: import("@ank-ingress/config").Field<number>;
    startupJitterMs: import("@ank-ingress/config").Field<number>;
    checkIntervalMs: import("@ank-ingress/config").Field<number>;
};
export type RuntimeConfig = ConfigOf<ReturnType<typeof runtimeSchema>>;
