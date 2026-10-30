import type { AnyRoute, Catalogs } from '@ank-ingress/contracts';
export interface OpenApiInfo {
    readonly title: string;
    readonly version: string;
    readonly description?: string;
}
export interface OpenApiOperation {
    readonly operationId: string;
    readonly parameters?: readonly Record<string, unknown>[];
    readonly requestBody?: Record<string, unknown>;
    readonly responses: Record<string, unknown>;
    readonly security?: readonly Record<string, readonly string[]>[];
}
export interface OpenApiDocument {
    readonly openapi: '3.1.0';
    readonly info: OpenApiInfo;
    readonly components: {
        readonly securitySchemes: Readonly<Record<string, unknown>>;
    };
    readonly paths: Readonly<Record<string, Readonly<Record<string, OpenApiOperation>>>>;
}
export declare function generateOpenApi(routes: readonly AnyRoute[], _catalogs: Catalogs, info?: OpenApiInfo): OpenApiDocument;
