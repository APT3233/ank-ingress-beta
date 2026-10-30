import type { OutboxRecord, ShardLease } from '@ank-ingress/contracts';
import type { WorkTracker } from '@ank-ingress/runtime';
import type { KafkaDeliveryResult } from '../../types/kafka.types.js';
import type { OutboxPublisherOptions } from '../../types/outbox-publisher.types.js';
/** Publisher state built once per `createOutboxPublisher` call and shared with the shard loop. */
export interface OutboxPublisherState {
    readonly options: OutboxPublisherOptions;
    readonly maxShards: number;
    readonly leaseTtlMs: number;
    readonly batchSize: number;
    readonly pollIntervalMs: number;
    readonly maxBackoffMs: number;
    readonly deliveryTimeoutMs: number;
    readonly maxAttempts: number;
    readonly tracker: WorkTracker;
    stopping: boolean;
    timer: NodeJS.Timeout | undefined;
    activeLeases: ShardLease[];
    consecutiveFailures: number;
}
export declare function releaseLeaseList(state: OutboxPublisherState, leases: readonly ShardLease[]): Promise<void>;
export declare function fetchAcrossLeases(state: OutboxPublisherState, leases: readonly ShardLease[]): Promise<OutboxRecord[]>;
export declare function deliverBatch(state: OutboxPublisherState, messages: readonly {
    readonly topic: string;
    readonly key: string;
    readonly value: Buffer;
    readonly headers: Readonly<Record<string, string>>;
}[]): Promise<readonly KafkaDeliveryResult[]>;
