export interface CorsOptions {
    /** `'*'`, one exact origin, a list of exact origins, or a predicate. */
    readonly origin: string | readonly string[] | ((origin: string) => boolean);
    readonly credentials?: boolean;
    /** Request headers allowed on preflight. Defaults to the headers the pipeline reads. */
    readonly allowHeaders?: readonly string[];
    /** Response headers readable by the browser. Defaults to `x-correlation-id`. */
    readonly exposeHeaders?: readonly string[];
    readonly maxAgeSeconds?: number;
}
