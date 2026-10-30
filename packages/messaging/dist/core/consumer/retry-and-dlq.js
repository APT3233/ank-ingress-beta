import { classifyExecutionError, isPostgresTransientSqlState } from "./execution-errors.js";
export async function executeWithTransientRetry(runner, fn, heartbeat, topic) {
    const { options, consumerGroup, maxAttempts, retryBaseMs, maxRetryBackoffMs, transientRetryCounter } = runner;
    let attempt = 0;
    while (!runner.stopping) {
        attempt++;
        try {
            await fn();
            return;
        }
        catch (err) {
            const classified = classifyExecutionError(err, options.catalogs, options.isTransientErrorCode ?? isPostgresTransientSqlState);
            if (classified.category !== 'TRANSIENT' && attempt >= maxAttempts) {
                throw err;
            }
            transientRetryCounter?.inc({
                consumer_group: consumerGroup,
                topic,
                error_code: classified.errorCode,
            });
            const delay = Math.min(maxRetryBackoffMs, retryBaseMs * Math.pow(2, Math.min(attempt - 1, 8))) +
                Math.floor(Math.random() * Math.max(1, retryBaseMs));
            await new Promise((res) => setTimeout(res, delay));
            await heartbeat().catch(() => { });
        }
    }
}
export async function sendToDlq(runner, topic, message, headers, errorMessage, attempts) {
    const { options } = runner;
    if (!options.dlqTopic || !options.producer)
        return;
    await options.producer.send({
        topic: options.dlqTopic,
        acks: -1,
        messages: [
            {
                key: message.key,
                value: message.value,
                headers: {
                    ...headers,
                    'x-original-topic': topic,
                    'x-error': errorMessage,
                    'x-attempts': String(attempts),
                },
            },
        ],
    });
}
