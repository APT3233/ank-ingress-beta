import type { RouteFor } from '@ank-ingress/contracts';
import type { HttpApp, ListenConfig } from '@ank-ingress/http';
import type { RouteTarget } from './router.types.js';
export interface ListeningApp {
    readonly port: number;
    close(): Promise<void>;
}
/** Re-exported so apps can describe where `inbound()` listens without importing the HTTP package. */
export type { ListenConfig };
export type ListenCallback = (server: ListeningApp) => void;
export interface App<Tx = unknown, AccessCtx = unknown> extends RouteTarget<Tx, AccessCtx, App<Tx, AccessCtx>> {
    readonly prefix: string;
    readonly routes: readonly RouteFor<Tx, AccessCtx>[];
    /** Registers routes built with `defineRoute` as-is (full `/api/v{n}` paths, no prefix applied). */
    add(...routes: readonly RouteFor<Tx, AccessCtx>[]): App<Tx, AccessCtx>;
    /** Seals the route list like `listen()` and returns an `Inbound` for `runApp` to start, drain and release. */
    inbound(listen: ListenConfig): ReturnType<HttpApp['inbound']>;
    listen(port?: number, callback?: ListenCallback): Promise<ListeningApp>;
    listen(port: number, host: string, callback?: ListenCallback): Promise<ListeningApp>;
}
