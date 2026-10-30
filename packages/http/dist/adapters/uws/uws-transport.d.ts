import { type TemplatedApp } from 'uWebSockets.js';
import type { AnyRoute } from '@ank-ingress/contracts';
import type { ListenConfig } from '../../types/listen.types.js';
import { DeadlineWheel } from './deadline-wheel.js';
import type { RequestCtx } from './request-ctx.js';
import type { TransportRuntimeState } from './transport-state.js';
export interface UwsTransport {
    readonly app: TemplatedApp;
    readonly deadlineWheel: DeadlineWheel<RequestCtx>;
    /** True from a successful `listen` until the returned handle is closed. */
    readonly listening: boolean;
    listen(config: ListenConfig): Promise<{
        readonly port?: number;
        close(): void;
    }>;
}
export declare function createUwsTransport(routes: readonly AnyRoute[], rt: TransportRuntimeState): UwsTransport;
