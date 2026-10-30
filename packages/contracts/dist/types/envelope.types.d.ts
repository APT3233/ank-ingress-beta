export interface EventEnvelope<T = unknown> {
    readonly id: string;
    readonly type: string;
    readonly version: number;
    readonly occurredAt: string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly sequence?: number;
    readonly tenantId: number | null;
    readonly correlationId: string;
    readonly traceparent?: string | null;
    readonly payload: T;
}
export interface CreateEnvelopeInput<T> {
    readonly id?: string;
    readonly type: string;
    readonly version: number;
    readonly occurredAt?: Date | string;
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly sequence?: number;
    readonly tenantId: number | null;
    readonly correlationId: string;
    readonly traceparent?: string | null;
    readonly payload: T;
}
