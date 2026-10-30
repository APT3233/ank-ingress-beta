import type { PubSub } from '@ank-ingress/contracts';
import type { HttpApp } from '@ank-ingress/http';
export interface RealtimeHubOptions {
    readonly httpApp: Pick<HttpApp, 'publish'>;
    readonly bus?: PubSub;
    readonly instanceId?: string;
    readonly channel?: string;
}
export interface RealtimeHub {
    start(): Promise<void>;
    stop(): Promise<void>;
    publish(tenantId: number | null, topic: string, message: string): Promise<void>;
}
export declare function createRealtimeHub(options: RealtimeHubOptions): RealtimeHub;
