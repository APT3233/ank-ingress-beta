export interface WorkTracker {
    enter(): () => void;
    inc(): void;
    dec(): void;
    readonly count: number;
    idle(signal: AbortSignal): Promise<void>;
}
export declare function createWorkTracker(): WorkTracker;
