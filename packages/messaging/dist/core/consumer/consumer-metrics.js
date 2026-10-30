const consumerMetricsCache = new WeakMap();
export function getConsumerMetrics(metrics) {
    if (!metrics)
        return null;
    let handles = consumerMetricsCache.get(metrics);
    if (!handles) {
        handles = {
            quarantinedCounter: metrics.counter('ank_consumer_quarantined_total', 'Total consumer messages quarantined due to malformed/unknown/version errors', ['consumer_group', 'topic', 'reason']),
            ignoredCounter: metrics.counter('ank_consumer_ignored_total', 'Total valid consumer messages ignored because no handler is registered', ['consumer_group', 'topic', 'event_type']),
            processedCounter: metrics.counter('ank_consumer_processed_total', 'Total consumer messages processed successfully', ['consumer_group', 'topic', 'event_type']),
            parkedCounter: metrics.counter('ank_consumer_parked_total', 'Total consumer messages parked behind a blocked aggregate', ['consumer_group', 'topic', 'event_type']),
            blockedCounter: metrics.counter('ank_consumer_blocked_total', 'Total consumer messages that failed permanently and blocked their aggregate', ['consumer_group', 'topic', 'error_code']),
            transientRetryCounter: metrics.counter('ank_consumer_transient_retries_total', 'Total consumer transient error retries', ['consumer_group', 'topic', 'error_code']),
        };
        consumerMetricsCache.set(metrics, handles);
    }
    return handles;
}
