import type { SocketSpec } from '@ank-ingress/contracts';
import type { HttpApp } from '@ank-ingress/http';
import type { MountSocketDeps } from '../../../types/socket.types.js';
export declare function mountSocket(httpApp: HttpApp, spec: SocketSpec, deps: MountSocketDeps): void;
