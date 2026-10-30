import { toRdKafkaHeaders } from "./headers.js";
/** Builds the framework producer over the shared native producer (once per client). */
export function createProducer(state) {
    const { config, logger, nativeProducer, deliveryTimeoutMs } = state;
    const producer = {
        async publishBatch(messages, options) {
            if (messages.length === 0) {
                return [];
            }
            if (state.producerDisconnected || !nativeProducer.isConnected()) {
                const err = new Error('Kafka producer is not connected');
                logger?.error('Kafka publishBatch rejected because producer is disconnected', {
                    clientId: config.clientId,
                    batchSize: messages.length,
                });
                throw err;
            }
            // Validate the entire batch before native enqueue can publish any prefix.
            const encodedHeaders = messages.map((message) => toRdKafkaHeaders(message.headers));
            const timeoutMs = options?.timeoutMs ?? deliveryTimeoutMs;
            state.batchCount += 1;
            state.produceCalls += messages.length;
            const opaques = [];
            const promises = new Array(messages.length);
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                const valueBuf = msg.value === null
                    ? null
                    : Buffer.isBuffer(msg.value)
                        ? msg.value
                        : Buffer.from(String(msg.value), 'utf8');
                // The native string overload truncates NUL; Buffer retains the UTF8 byte length.
                const keyVal = typeof msg.key === 'string' ? Buffer.from(msg.key, 'utf8') : (msg.key ?? null);
                const tsVal = msg.timestamp !== undefined ? Number(msg.timestamp) : 0;
                const rdHeaders = encodedHeaders[i];
                promises[i] = new Promise((resolve) => {
                    const opaque = {
                        index: i,
                        topic: msg.topic,
                        userOpaque: msg.opaque,
                        settled: false,
                        resolve,
                    };
                    opaques.push(opaque);
                    try {
                        nativeProducer.produce(msg.topic, msg.partition ?? -1, valueBuf, keyVal, tsVal, opaque, rdHeaders);
                    }
                    catch (err) {
                        opaque.settled = true;
                        const error = err instanceof Error ? err : new Error(String(err));
                        logger?.error('Kafka produce enqueue failed', {
                            clientId: config.clientId,
                            topic: msg.topic,
                            error: error.message,
                        });
                        resolve({
                            index: i,
                            topic: msg.topic,
                            partition: msg.partition ?? -1,
                            offset: null,
                            opaque: msg.opaque,
                            error,
                        });
                    }
                });
            }
            // Immediately flush accumulated messages in librdkafka so the entire batch is transmitted
            // together in minimal ProduceRequests without waiting for linger.ms to expire.
            const flushTimer = setTimeout(() => {
                const timeoutErr = new Error(`Kafka delivery timed out after ${timeoutMs}ms`);
                for (const op of opaques) {
                    if (!op.settled) {
                        op.settled = true;
                        op.resolve({
                            index: op.index,
                            topic: op.topic,
                            partition: -1,
                            offset: null,
                            opaque: op.userOpaque,
                            error: timeoutErr,
                        });
                    }
                }
            }, timeoutMs + 200);
            flushTimer.unref?.();
            nativeProducer.flush(timeoutMs, (flushErr) => {
                try {
                    nativeProducer.poll();
                }
                catch {
                    // Ignore poll errors when disconnecting
                }
                if (flushErr) {
                    const err = new Error(flushErr.message || `Kafka flush failed (${flushErr.code})`);
                    logger?.error('Kafka producer flush error', {
                        clientId: config.clientId,
                        code: flushErr.code,
                        error: err.message,
                    });
                    for (const op of opaques) {
                        if (!op.settled) {
                            op.settled = true;
                            op.resolve({
                                index: op.index,
                                topic: op.topic,
                                partition: -1,
                                offset: null,
                                opaque: op.userOpaque,
                                error: err,
                            });
                        }
                    }
                }
            });
            try {
                return await Promise.all(promises);
            }
            finally {
                clearTimeout(flushTimer);
            }
        },
        async send(record) {
            const flat = record.messages.map((m) => ({ ...m, topic: record.topic }));
            const results = await this.publishBatch(flat);
            const failed = results.find((r) => r.error !== null);
            if (failed?.error) {
                throw failed.error;
            }
            return results;
        },
        async sendBatch(batch, options) {
            const flat = [];
            for (const tm of batch.topicMessages) {
                for (const m of tm.messages) {
                    flat.push({ ...m, topic: tm.topic });
                }
            }
            const results = await this.publishBatch(flat, options);
            const failed = results.find((r) => r.error !== null);
            if (failed?.error) {
                throw failed.error;
            }
            return results;
        },
        async flush(timeoutMs = deliveryTimeoutMs) {
            if (state.producerDisconnected || !nativeProducer.isConnected())
                return;
            await new Promise((resolve, reject) => {
                nativeProducer.flush(timeoutMs, (err) => {
                    if (err) {
                        reject(new Error(err.message || 'Kafka producer flush failed'));
                        return;
                    }
                    resolve();
                });
            });
        },
        getStats() {
            try {
                if (!state.producerDisconnected && nativeProducer.isConnected()) {
                    nativeProducer.poll();
                }
            }
            catch {
                // Ignore poll error
            }
            return {
                produceCalls: state.produceCalls,
                batchCount: state.batchCount,
                batchCalls: state.batchCount,
                batchMessagesSent: state.produceCalls,
                txRequests: state.txRequests,
                txMessages: state.txMessages,
                tx: state.txRequests,
                txmsgs: state.txMessages,
            };
        },
        async disconnect() {
            if (state.producerDisconnected)
                return;
            state.producerDisconnected = true;
            if (!nativeProducer.isConnected())
                return;
            await new Promise((resolve) => {
                nativeProducer.disconnect(5_000, () => resolve());
            });
        },
    };
    return producer;
}
