import RdKafka from '@confluentinc/kafka-javascript';
import { createAdmin } from "./admin.js";
import { createKafkaConsumer } from "./consumer.js";
import { createProducer } from "./producer.js";
import { attachProducerEvents } from "./producer-events.js";
export async function createKafka(config) {
    const logger = config.logger;
    const connectTimeoutMs = config.connectTimeoutMs ?? 5_000;
    const lingerMs = config.lingerMs ?? 2;
    const deliveryTimeoutMs = config.deliveryTimeoutMs ?? 10_000;
    const requestTimeoutMs = Math.max(100, Math.min(config.requestTimeoutMs ?? 5_000, Math.max(100, deliveryTimeoutMs - lingerMs)));
    const socketTimeoutMs = Math.max(requestTimeoutMs, config.socketTimeoutMs ?? 5_000);
    const producerGlobalConf = {
        'metadata.broker.list': config.brokers.join(','),
        'client.id': config.clientId,
        'enable.idempotence': true,
        'max.in.flight.requests.per.connection': config.maxInFlightRequests ?? 5,
        retries: config.retries ?? 5,
        'retry.backoff.ms': config.retryBackoffMs ?? 100,
        'retry.backoff.max.ms': config.retryBackoffMaxMs ?? 2_000,
        'reconnect.backoff.ms': config.retryBackoffMs ?? 100,
        'reconnect.backoff.max.ms': config.retryBackoffMaxMs ?? 2_000,
        'socket.timeout.ms': socketTimeoutMs,
        'socket.connection.setup.timeout.ms': Math.max(1_000, connectTimeoutMs),
        'linger.ms': lingerMs,
        'batch.num.messages': config.batchNumMessages ?? 1_000,
        'batch.size': config.batchSizeBytes ?? 65_536,
        'compression.type': config.compression ?? 'lz4',
        'queue.buffering.max.messages': config.maxQueueMessages ?? 10_000,
        'queue.buffering.max.kbytes': config.maxQueueKbytes ?? 32_768,
        'allow.auto.create.topics': false,
        'statistics.interval.ms': config.statisticsIntervalMs ?? 200,
        dr_cb: true,
        log_level: 4,
    };
    const producerTopicConf = {
        acks: -1,
        'request.timeout.ms': requestTimeoutMs,
        'delivery.timeout.ms': Math.max(requestTimeoutMs + lingerMs, deliveryTimeoutMs),
        partitioner: 'murmur2_random',
    };
    const nativeProducer = new RdKafka.Producer(producerGlobalConf, producerTopicConf);
    const state = {
        config,
        logger,
        connectTimeoutMs,
        deliveryTimeoutMs,
        nativeProducer,
        consumers: new Set(),
        produceCalls: 0,
        batchCount: 0,
        txRequests: 0,
        txMessages: 0,
        producerDisconnected: false,
    };
    attachProducerEvents(state);
    await new Promise((resolve, reject) => {
        let firstConnectErr = null;
        const onErr = (err) => {
            if (!firstConnectErr) {
                firstConnectErr = new Error(err.message || 'Kafka producer connect error');
            }
        };
        nativeProducer.once('event.error', onErr);
        nativeProducer.connect({ timeout: connectTimeoutMs }, (err) => {
            nativeProducer.removeListener('event.error', onErr);
            if (err) {
                const finalErr = firstConnectErr ?? new Error(err.message || 'Failed to connect Kafka producer');
                logger?.error('Kafka producer initial connect failed', {
                    clientId: config.clientId,
                    error: finalErr.message,
                });
                reject(finalErr);
                return;
            }
            resolve();
        });
    });
    nativeProducer.setPollInBackground(true);
    const admin = createAdmin(state);
    const consumers = state.consumers;
    const producer = createProducer(state);
    const createConsumer = (groupId, options) => createKafkaConsumer(state, groupId, options);
    const resource = {
        name: config.name ?? 'kafka',
        required: config.required ?? true,
        async check() {
            await admin.listTopics(3_000);
        },
        async close() {
            await Promise.allSettled([
                ...Array.from(consumers, (c) => c.disconnect()),
                producer.disconnect(),
                admin.disconnect(),
            ]);
            consumers.clear();
        },
    };
    return {
        producer,
        admin,
        createConsumer,
        async ensureTopics(topics, numPartitions = 1) {
            const existing = new Set(await admin.listTopics());
            const missing = topics.filter((t) => !existing.has(t));
            if (missing.length > 0) {
                await admin.createTopics({
                    waitForLeaders: true,
                    topics: missing.map((topic) => ({
                        topic,
                        numPartitions,
                        replicationFactor: 1,
                    })),
                });
            }
        },
        resource,
    };
}
