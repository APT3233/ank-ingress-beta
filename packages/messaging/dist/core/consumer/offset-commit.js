export async function commitOffsetSafely(runner, state, offset, heartbeat, processedOffsets) {
    const { options, consumerGroup, maxAttempts, retryBaseMs, maxRetryBackoffMs } = runner;
    if (state.revoked)
        return;
    if (options.beforeOffsetCommit) {
        await options.beforeOffsetCommit({
            topic: state.topic,
            partition: state.partition,
            offset,
        });
    }
    if (state.revoked)
        return;
    const nextOffset = (BigInt(offset) + 1n).toString();
    let attempt = 0;
    while (!runner.stopping && !state.revoked) {
        attempt++;
        try {
            await options.consumer.commitOffsets([
                { topic: state.topic, partition: state.partition, offset: nextOffset },
            ]);
            if (options.afterMessageProcessed) {
                if (processedOffsets && processedOffsets.length > 0) {
                    for (const off of processedOffsets) {
                        options.afterMessageProcessed({
                            topic: state.topic,
                            partition: state.partition,
                            offset: off,
                        });
                    }
                }
                else {
                    options.afterMessageProcessed({
                        topic: state.topic,
                        partition: state.partition,
                        offset,
                    });
                }
            }
            return;
        }
        catch (err) {
            options.logger?.warn('consumer.offset_commit_retry', {
                consumerGroup,
                topic: state.topic,
                partition: state.partition,
                offset: nextOffset,
                attempt,
                error: err instanceof Error ? err.message : String(err),
            });
            if (attempt >= maxAttempts) {
                throw err;
            }
            const delay = Math.min(maxRetryBackoffMs, retryBaseMs * attempt);
            await new Promise((res) => setTimeout(res, delay));
            await heartbeat().catch(() => { });
        }
    }
}
