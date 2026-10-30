export interface TraceContext {
    readonly version: '00';
    readonly traceId: string;
    readonly parentId: string;
    readonly flags: string;
    readonly sampled: boolean;
}
export declare function randomHex16(): string;
export declare function randomHex32(): string;
export declare function parseTraceparent(header: string | null | undefined): TraceContext | null;
export declare function formatTraceparent(ctx: Pick<TraceContext, 'traceId' | 'parentId'> & {
    readonly flags?: string;
    readonly sampled?: boolean;
}): string;
export declare function childSpan(parent?: TraceContext | null): TraceContext;
