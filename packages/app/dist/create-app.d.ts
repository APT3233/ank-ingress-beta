import { type Catalogs } from '@ank-ingress/contracts';
import { type CreateHttpAppOptions } from '@ank-ingress/http';
import { type Logger } from '@ank-ingress/observability';
import type { App } from './types/app.types.js';
export interface CreateAppOptions<Tx = unknown, Access = unknown> extends Omit<CreateHttpAppOptions<Tx, Access>, 'routes' | 'catalogs' | 'logger'> {
    /** Prepended to every route path; must match `/api/v{n}`. Defaults to `/api/v1`. */
    readonly prefix?: string;
    readonly catalogs?: Catalogs;
    readonly logger?: Logger;
    /**
     * On SIGTERM/SIGINT: stop accepting requests, drain in-flight ones (up to `timeoutMs`, default 25s),
     * then exit (code 1 if the drain timed out). A second signal terminates immediately. Off by default.
     */
    readonly handleSignals?: boolean | {
        readonly timeoutMs?: number;
    };
}
export declare function createApp<Tx = unknown, Access = unknown>(options?: CreateAppOptions<Tx, Access>): App<Tx, Access>;
