import type { KafkaConsumedMessage } from '../../types/kafka.types.js';
import type { ConsumerRunnerState } from './partition-queue.js';
export declare function executeWithTransientRetry<Tx>(runner: ConsumerRunnerState<Tx>, fn: () => Promise<void>, heartbeat: () => Promise<void>, topic: string): Promise<void>;
export declare function sendToDlq<Tx>(runner: ConsumerRunnerState<Tx>, topic: string, message: KafkaConsumedMessage, headers: Readonly<Record<string, string>>, errorMessage: string, attempts: number): Promise<void>;
