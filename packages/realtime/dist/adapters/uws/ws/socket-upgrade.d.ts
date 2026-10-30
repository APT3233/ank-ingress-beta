import type { HttpRequest, HttpResponse, us_socket_context_t } from 'uWebSockets.js';
import { type HttpApp } from '@ank-ingress/http';
import type { MountSocketDeps } from '../../../types/socket.types.js';
export declare function createUpgradeHandler(httpApp: HttpApp, deps: MountSocketDeps, pendingUpgrades: Set<() => void>): (res: HttpResponse, req: HttpRequest, context: us_socket_context_t) => void;
