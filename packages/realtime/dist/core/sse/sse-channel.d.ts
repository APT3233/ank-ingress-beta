import { type StreamReply } from '@ank-ingress/contracts';
export interface SseChannelOptions {
    readonly maxHistory?: number;
    readonly maxHistoryBytes?: number;
    readonly maxClientBufferBytes?: number;
    readonly heartbeatIntervalMs?: number;
}
export interface SseSubscribeOptions {
    readonly lastEventId?: string;
    readonly signal: AbortSignal;
}
export interface SseChannel<T = unknown> {
    publish(id: string, event: string, data: T): void;
    subscribe(options: SseSubscribeOptions): StreamReply;
}
export declare function createSseChannel<T = unknown>(options?: SseChannelOptions): SseChannel<T>;
