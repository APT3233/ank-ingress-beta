import type { App } from '../../types/app.types.js';
export interface TestRequestInit {
    readonly headers?: Readonly<Record<string, string>>;
    /** Sent as JSON with `content-type: application/json` unless one is given. */
    readonly json?: unknown;
    readonly body?: string;
    readonly query?: Readonly<Record<string, string | number | boolean>>;
}
type Send = (path: string, init?: TestRequestInit) => Promise<Response>;
export interface TestClient {
    /** `http://127.0.0.1:<port><prefix>`; request paths are relative to it, like route paths. */
    readonly baseUrl: string;
    request(method: string, path: string, init?: TestRequestInit): Promise<Response>;
    readonly get: Send;
    readonly post: Send;
    readonly put: Send;
    readonly patch: Send;
    readonly delete: Send;
    readonly head: Send;
    readonly options: Send;
    close(): Promise<void>;
}
/**
 * Listens on an ephemeral 127.0.0.1 port and sends real HTTP requests through uWS, so tests cover
 * the same pipeline as production. Redirects are not followed. The app is sealed, as after `listen()`.
 */
export declare function createTestClient<Tx, AccessCtx>(app: App<Tx, AccessCtx>): Promise<TestClient>;
export {};
