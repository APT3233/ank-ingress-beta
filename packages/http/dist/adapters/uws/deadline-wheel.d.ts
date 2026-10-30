/** Intrusive list node the wheel links, unlinks, and expires (a `RequestCtx` in the transport). */
export interface DeadlineEntry<T extends DeadlineEntry<T>> {
    readonly deadlineAt: number;
    deadlineWheel: DeadlineWheel<T> | null;
    deadlineLane: DeadlineLane<T> | null;
    deadlinePrev: T | null;
    deadlineNext: T | null;
    onDeadlineExpire: ((ctx: T) => void) | null;
}
export interface DeadlineLane<T extends DeadlineEntry<T> = DeadlineEntry<any>> {
    head: T | null;
    tail: T | null;
    count: number;
}
export declare class DeadlineWheel<T extends DeadlineEntry<T> = DeadlineEntry<any>> {
    private readonly lanes;
    private readonly timer;
    private _activeCount;
    private closed;
    constructor(tickMs?: number);
    get activeCount(): number;
    getLane(timeoutMs: number): DeadlineLane<T>;
    scheduleLane(ctx: T, lane: DeadlineLane<T>, onExpire: (ctx: T) => void): void;
    schedule(ctx: T, timeoutMs: number, onExpire: (ctx: T) => void): void;
    unlink(ctx: T): void;
    sweep(now?: number): void;
    close(): void;
}
