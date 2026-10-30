import type { Identity } from './identity.types.js';
export type SocketSendStatus = 'sent' | 'backpressure' | 'dropped';
export interface SocketClient {
    readonly identity: Identity;
    readonly closed?: boolean;
    send(topic: string, data: string | Uint8Array, options?: {
        readonly lossy?: boolean;
    }): boolean;
    sendWithStatus?(topic: string, data: string | Uint8Array, options?: {
        readonly lossy?: boolean;
    }): SocketSendStatus;
    subscribe(topic: string): void;
    unsubscribe(topic: string): void;
    close(code?: number, reason?: string): void;
    getBufferedAmount(): number;
}
export interface SocketSpec {
    readonly path: string;
    readonly maxPayloadLength?: number;
    readonly idleTimeoutSec?: number;
    readonly maxBackpressureBytes?: number;
    readonly maxPendingMessages?: number;
    onOpen?(client: SocketClient): void | Promise<void>;
    onMessage?(client: SocketClient, message: Uint8Array, isBinary: boolean): void | Promise<void>;
    onDrain?(client: SocketClient): void | Promise<void>;
    onClose?(client: SocketClient, code: number): void | Promise<void>;
}
