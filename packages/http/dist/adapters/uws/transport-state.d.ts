import type { BoundCounter, Counter, Histogram, Logger } from '@ank-ingress/observability';
import type { WorkTracker } from '@ank-ingress/runtime';
import type { CompileDependencies } from '../../types/stages.types.js';
import type { DeadlineWheel } from './deadline-wheel.js';
import type { RequestCtx } from './request-ctx.js';
import type { ResponseDecor } from './request-state.js';
export interface TransportRuntimeState {
    draining: boolean;
    trustUnixSocket: boolean;
    readonly trustedProxies: ReadonlySet<string>;
    readonly maxInFlight: number;
    readonly workTracker: WorkTracker;
    readonly logger: Logger;
    readonly deps: CompileDependencies;
    readonly decor?: ResponseDecor;
    readonly deadlineWheel?: DeadlineWheel<RequestCtx>;
    readonly activeStreams?: Set<RequestCtx>;
    readonly reqCounterMetric?: Counter;
    readonly reqCounter?: (method: string, route: string, status: number) => void;
    readonly reqDuration?: Histogram;
    readonly shedCounter?: BoundCounter;
}
