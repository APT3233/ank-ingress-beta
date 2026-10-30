import type { KafkaBundle } from '../../types/kafka.types.js';
export interface ReplayDlqOptions {
    readonly kafka: KafkaBundle;
    readonly dlqTopic: string;
    readonly targetTopic: string;
    readonly maxMessages: number;
    readonly dryRun?: boolean;
    readonly timeoutMs?: number;
}
export interface ReplayedDlqItem {
    readonly key: string | null;
    readonly headers: Readonly<Record<string, string>>;
}
export interface ReplayDlqResult {
    readonly count: number;
    readonly messages: readonly ReplayedDlqItem[];
}
export declare function replayDlq(options: ReplayDlqOptions): Promise<ReplayDlqResult>;
