export type ReadinessState = 'STARTING' | 'READY' | 'DEGRADED' | 'NOT_READY' | 'DRAINING' | 'STOPPED';
export interface DependencyHealth {
    readonly state: 'UP' | 'DEGRADED' | 'DOWN';
    readonly latencyMs?: number;
}
export interface HealthSnapshot {
    readonly state: ReadinessState;
    readonly acceptingTraffic: boolean;
    readonly dependencies: Readonly<Record<string, DependencyHealth>>;
}
