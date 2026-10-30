import type { Identity, SocketClient } from '@ank-ingress/contracts';
import type { Logger } from '@ank-ingress/observability';
import type { AuthStage } from '@ank-ingress/http';
export interface SocketUserData {
    readonly identity: Identity;
    client: SocketClient;
    closed: boolean;
    backpressured: boolean;
    inFlightMessages: number;
    pendingHooks: number;
    readonly messageQueue: Array<{
        readonly data: Uint8Array;
        readonly isBinary: boolean;
        readonly done: () => void;
    }>;
}
export interface MountSocketDeps {
    readonly auth: AuthStage;
    readonly logger?: Logger;
    readonly authorizeTenant?: (identity: Identity, signal: AbortSignal) => Promise<void>;
}
