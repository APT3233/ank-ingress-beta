import type { AnyRoute, BodyFormat, HttpMethod, PermissionSpec, ResponseKind } from '@ank-ingress/contracts';
export interface CompiledRoute {
    readonly spec: AnyRoute;
    readonly method: HttpMethod;
    readonly path: string;
    readonly tx: 'none' | 'read' | 'write';
    readonly responseKind: ResponseKind;
    readonly bodyFormat: BodyFormat;
    readonly paramNames: readonly string[];
    readonly headerNames: readonly string[];
    readonly needsBody: boolean;
    readonly needsQuery: boolean;
    readonly needsAuth: boolean;
    readonly needsIdempotencyHash: boolean;
    readonly timeoutMs: number;
    readonly maxBodyBytes: number;
    readonly permissionSpec: PermissionSpec | null;
    readonly serializeResponse: ((value: unknown) => string) | null;
    validateParams(raw: Record<string, string>): Record<string, unknown>;
    validateQuery(rawQuery: string): Record<string, unknown>;
    validateBody(rawBody: unknown): unknown;
}
