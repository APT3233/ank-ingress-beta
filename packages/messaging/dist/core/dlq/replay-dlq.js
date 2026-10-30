import { randomUUID } from 'node:crypto';
export async function replayDlq(options) {
    const groupId = `ank-dlq-replay-${randomUUID().slice(0, 8)}`;
    const consumer = await options.kafka.createConsumer(groupId);
    const items = [];
    const timeoutMs = options.timeoutMs ?? 5000;
    try {
        await consumer.subscribe({ topic: options.dlqTopic, fromBeginning: true });
        await new Promise((resolveDone, rejectDone) => {
            const timer = setTimeout(() => resolveDone(), timeoutMs);
            consumer
                .run({
                autoCommit: false,
                eachMessage: async ({ topic, partition, message }) => {
                    if (items.length >= options.maxMessages) {
                        clearTimeout(timer);
                        resolveDone();
                        return;
                    }
                    const headers = {};
                    if (message.headers) {
                        for (const [k, v] of Object.entries(message.headers)) {
                            if (v === undefined)
                                continue;
                            const val = Array.isArray(v) ? v[0] : v;
                            if (val !== undefined) {
                                headers[k] = Buffer.isBuffer(val) ? val.toString('utf8') : String(val);
                            }
                        }
                    }
                    if (!options.dryRun) {
                        const forwardHeaders = { ...headers };
                        delete forwardHeaders['x-error'];
                        delete forwardHeaders['x-attempts'];
                        await options.kafka.producer.send({
                            topic: options.targetTopic,
                            acks: -1,
                            messages: [
                                {
                                    key: message.key,
                                    value: message.value,
                                    headers: forwardHeaders,
                                },
                            ],
                        });
                        const nextOffset = (BigInt(message.offset) + 1n).toString();
                        await consumer.commitOffsets([{ topic, partition, offset: nextOffset }]);
                    }
                    items.push({
                        key: message.key ? message.key.toString('utf8') : null,
                        headers,
                    });
                    if (items.length >= options.maxMessages) {
                        clearTimeout(timer);
                        resolveDone();
                    }
                },
            })
                .catch((err) => {
                clearTimeout(timer);
                rejectDone(err);
            });
        });
        return {
            count: items.length,
            messages: items,
        };
    }
    finally {
        await consumer.stop().catch(() => { });
        await consumer.disconnect().catch(() => { });
    }
}
