import type { MetricsRegistry } from '@ank-ingress/observability';
import type { WorkTracker } from '@ank-ingress/runtime';
import type { ConsumerRunnerOptions } from '../../types/consumer-runner.types.js';
import type { KafkaConsumedMessage, KafkaTopicPartition } from '../../types/kafka.types.js';
export interface QueuedMessageItem {
    readonly message: KafkaConsumedMessage;
    readonly byteSize: number;
    readonly heartbeat: () => Promise<void>;
    readonly done: Promise<void>;
    readonly resolveDone: () => void;
}
export interface PartitionQueueState {
    readonly key: string;
    readonly topic: string;
    readonly partition: number;
    readonly queue: QueuedMessageItem[];
    running: boolean;
    revoked: boolean;
    pausedByQueue: boolean;
    batchDisabled: boolean;
    inFlightPromise: Promise<void> | null;
}
type ConsumerCounter = ReturnType<MetricsRegistry['counter']>;
/** Runner state built once per `createConsumerRunner` call and passed to the queue, batch and message steps. */
export interface ConsumerRunnerState<Tx = unknown> {
    readonly options: ConsumerRunnerOptions<Tx>;
    readonly consumerGroup: string;
    readonly maxAttempts: number;
    readonly retryBaseMs: number;
    readonly maxRetryBackoffMs: number;
    readonly overloadPauseMs: number;
    readonly partitionConcurrency: number;
    readonly maxQueueRecords: number;
    readonly maxQueueBytes: number;
    readonly executionController: AbortController;
    readonly tracker: WorkTracker;
    readonly quarantinedCounter: ConsumerCounter | undefined;
    readonly ignoredCounter: ConsumerCounter | undefined;
    readonly processedCounter: ConsumerCounter | undefined;
    readonly parkedCounter: ConsumerCounter | undefined;
    readonly blockedCounter: ConsumerCounter | undefined;
    readonly transientRetryCounter: ConsumerCounter | undefined;
    readonly partitionStates: Map<string, PartitionQueueState>;
    readonly pendingPartitions: PartitionQueueState[];
    stopping: boolean;
    activePartitions: number;
    totalQueuedRecords: number;
    totalQueuedBytes: number;
}
export declare function waitWhileOverloaded<Tx>(runner: ConsumerRunnerState<Tx>, topic: string, partition: number): Promise<void>;
export declare function maybeResumePausedPartitions<Tx>(runner: ConsumerRunnerState<Tx>): void;
export declare function handlePartitionsRevoked<Tx>(runner: ConsumerRunnerState<Tx>, partitions: readonly KafkaTopicPartition[]): Promise<void>;
export {};
