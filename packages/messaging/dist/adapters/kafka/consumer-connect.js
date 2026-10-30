/** Registers the consumer error/log listeners, connects, and applies the default consume timeouts. */
export async function connectNativeConsumer(nativeConsumer, logger, groupId, connectTimeoutMs, consumeTimeoutMs) {
    nativeConsumer.on('event.error', (err) => {
        logger?.error('Kafka consumer event.error', {
            groupId,
            code: err.code,
            origin: err.origin,
            error: err.message,
        });
    });
    nativeConsumer.on('event.log', (ev) => {
        if (ev && typeof ev.severity === 'number' && ev.severity <= 4) {
            if (ev.severity <= 3) {
                logger?.error('Kafka consumer log', { groupId, fac: ev.fac, message: ev.message });
            }
            else {
                logger?.warn('Kafka consumer log', { groupId, fac: ev.fac, message: ev.message });
            }
        }
    });
    await new Promise((resolve, reject) => {
        nativeConsumer.connect({ timeout: connectTimeoutMs }, (err) => {
            if (err) {
                reject(new Error(err.message || `Failed to connect Kafka consumer (${groupId})`));
                return;
            }
            resolve();
        });
    });
    nativeConsumer.setDefaultConsumeTimeout(consumeTimeoutMs);
    nativeConsumer.setDefaultIsTimeoutOnlyForFirstMessage?.(true);
}
