import type { MetricsRegistry } from '@ank-ingress/observability';
interface ConsumerMetricsHandles {
    readonly quarantinedCounter: ReturnType<MetricsRegistry['counter']>;
    readonly ignoredCounter: ReturnType<MetricsRegistry['counter']>;
    readonly processedCounter: ReturnType<MetricsRegistry['counter']>;
    readonly parkedCounter: ReturnType<MetricsRegistry['counter']>;
    readonly blockedCounter: ReturnType<MetricsRegistry['counter']>;
    readonly transientRetryCounter: ReturnType<MetricsRegistry['counter']>;
}
export declare function getConsumerMetrics(metrics?: MetricsRegistry): ConsumerMetricsHandles | null;
export {};
