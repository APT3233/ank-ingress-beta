import type { TemplatedApp } from 'uWebSockets.js';
import type { HttpMethod } from '@ank-ingress/contracts';
import type { CompiledCors } from './cors-preflight.js';
/** Registers CORS preflight, 405 Method Not Allowed, and the catch-all 404 after every route. */
export declare function registerRouteFallbacks(app: TemplatedApp, methodsByPath: ReadonlyMap<string, ReadonlySet<HttpMethod | 'HEAD'>>, cors: CompiledCors | null): void;
