import type { PubSub } from '@ank-ingress/contracts';
import type { RedisBundle } from './redis-client.js';
export type PubSubBus = PubSub;
export declare function createPubSubBus(bundle: Pick<RedisBundle, 'cmd' | 'sub'>): PubSubBus;
