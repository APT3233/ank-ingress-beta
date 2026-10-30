import type { HttpRequest, HttpResponse } from 'uWebSockets.js';
import type { CompiledRoute } from '../../../types/compiled-route.types.js';
import type { TransportRuntimeState } from '../transport-state.js';
export declare function createUwsRouteHandler(compiled: CompiledRoute, rt: TransportRuntimeState, isHead?: boolean): (res: HttpResponse, req: HttpRequest) => void;
