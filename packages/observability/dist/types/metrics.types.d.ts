export type Labels = Readonly<Record<string, string | number>>;
export declare const DEFAULT_LATENCY_BUCKETS: readonly number[];
export interface BoundCounter {
    inc(delta?: number): void;
    get(): number;
}
export interface Counter {
    inc(labels?: Labels, delta?: number): void;
    bind(labels?: Labels): BoundCounter;
    seriesCount(): number;
}
export interface BoundGauge {
    set(value: number): void;
    inc(delta?: number): void;
    dec(delta?: number): void;
    get(): number;
}
export interface Gauge {
    set(labelsOrValue: Labels | number, value?: number): void;
    inc(labels?: Labels, delta?: number): void;
    dec(labels?: Labels, delta?: number): void;
    bind(labels?: Labels): BoundGauge;
    seriesCount(): number;
}
export interface BoundHistogram {
    observe(value: number): void;
}
export interface Histogram {
    observe(labelsOrValue: Labels | number, value?: number): void;
    bind(labels?: Labels): BoundHistogram;
    seriesCount(): number;
}
export interface MetricsRegistry {
    counter(name: string, help: string, labelNames?: readonly string[]): Counter;
    gauge(name: string, help: string, labelNames?: readonly string[]): Gauge;
    histogram(name: string, help: string, labelNames?: readonly string[], buckets?: readonly number[]): Histogram;
    onCollect?(fn: () => void): void;
    render(): string;
}
