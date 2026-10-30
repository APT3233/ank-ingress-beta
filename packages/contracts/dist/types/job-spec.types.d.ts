import type { Static, TSchema } from '@sinclair/typebox';
export interface JobSpec<P extends TSchema = TSchema, R = unknown> {
    readonly name: string;
    readonly payload: P;
    readonly maxAttempts?: number;
    readonly leaseMs?: number;
    readonly timeoutMs?: number;
    readonly __resultType?: R;
}
export interface JobRecord<P = unknown> {
    readonly id: string;
    readonly type: string;
    readonly tenantId: number | null;
    readonly payload: P;
    readonly attempts: number;
    readonly maxAttempts: number;
    readonly correlationId: string | null;
    readonly leaseOwner?: string | null;
    readonly leaseGeneration?: number;
}
export interface JobHandlerSpec<P extends TSchema = TSchema, R = unknown> {
    readonly spec: JobSpec<P, R>;
    handle(job: JobRecord<Static<P>>, signal: AbortSignal): Promise<R>;
}
