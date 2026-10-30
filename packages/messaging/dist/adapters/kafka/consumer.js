import RdKafka from '@confluentinc/kafka-javascript';
import { toConsumedMessage } from "./consumed-message.js";
import { connectNativeConsumer } from "./consumer-connect.js";
/** Creates one framework consumer for a group; its rebalance, run loop and pause/resume share per-consumer state. */
export async function createKafkaConsumer(state, groupId, options) {
    const { config, logger, connectTimeoutMs, consumers } = state;
    const consumeTimeoutMs = options?.consumeTimeoutMs ?? 100;
    let currentAssignment = [];
    let activeRunOpts = null;
    const pausedSet = new Set();
    const consumerGlobalConf = {
        'metadata.broker.list': config.brokers.join(','),
        'client.id': `${config.clientId}-${groupId}`,
        'group.id': groupId,
        'enable.auto.commit': false,
        'enable.auto.offset.store': false,
        'allow.auto.create.topics': false,
        'session.timeout.ms': options?.sessionTimeoutMs ?? 10_000,
        'heartbeat.interval.ms': options?.heartbeatIntervalMs ?? 1_000,
        'max.poll.interval.ms': options?.maxPollIntervalMs ?? 300_000,
        'fetch.wait.max.ms': 100,
        'fetch.min.bytes': 1,
        rebalance_cb: (err, assignments) => {
            const mapped = (assignments ?? []).map((a) => ({ topic: a.topic, partition: a.partition }));
            try {
                if (err.code === -175 /* ERR__ASSIGN_PARTITIONS */) {
                    currentAssignment = mapped;
                    nativeConsumer.assign(assignments);
                    void Promise.all([
                        options?.onPartitionsAssigned?.(mapped),
                        activeRunOpts?.onPartitionsAssigned?.(mapped),
                    ]).catch((cbErr) => {
                        logger?.error('Kafka onPartitionsAssigned error', {
                            groupId,
                            error: cbErr instanceof Error ? cbErr.message : String(cbErr),
                        });
                    });
                }
                else if (err.code === -174 /* ERR__REVOKE_PARTITIONS */) {
                    const revoked = mapped.length > 0 ? mapped : currentAssignment;
                    currentAssignment = currentAssignment.filter((a) => !revoked.some((r) => r.topic === a.topic && r.partition === a.partition));
                    for (const r of revoked) {
                        pausedSet.delete(`${r.topic}:${r.partition}`);
                    }
                    void Promise.all([
                        options?.onPartitionsRevoked?.(revoked),
                        activeRunOpts?.onPartitionsRevoked?.(revoked),
                    ])
                        .catch((cbErr) => {
                        logger?.error('Kafka onPartitionsRevoked error', {
                            groupId,
                            error: cbErr instanceof Error ? cbErr.message : String(cbErr),
                        });
                    })
                        .finally(() => {
                        try {
                            if (nativeConsumer.isConnected()) {
                                nativeConsumer.unassign();
                            }
                        }
                        catch {
                            // Ignore if already disconnected
                        }
                    });
                }
            }
            catch (rebalanceErr) {
                logger?.error('Kafka rebalance error', {
                    groupId,
                    error: rebalanceErr instanceof Error ? rebalanceErr.message : String(rebalanceErr),
                });
            }
        },
        offset_commit_cb: true,
        log_level: 4,
    };
    const consumerTopicConf = {
        'auto.offset.reset': (options?.fromBeginning ?? true) ? 'earliest' : 'latest',
    };
    const nativeConsumer = new RdKafka.KafkaConsumer(consumerGlobalConf, consumerTopicConf);
    await connectNativeConsumer(nativeConsumer, logger, groupId, connectTimeoutMs, consumeTimeoutMs);
    const subscribedTopics = new Set();
    let running = false;
    let disconnected = false;
    let loopPromise = null;
    const consumerWrapper = {
        async subscribe(sub) {
            if (sub.topic)
                subscribedTopics.add(sub.topic);
            if (sub.topics) {
                for (const t of sub.topics)
                    subscribedTopics.add(t);
            }
            if (subscribedTopics.size > 0) {
                nativeConsumer.subscribe([...subscribedTopics]);
            }
        },
        async run(runOpts) {
            if (running)
                return;
            running = true;
            activeRunOpts = runOpts;
            const fetchBatchSize = runOpts.eachBatch ? (runOpts.maxBatchSize ?? 1024) : 1;
            const heartbeat = async () => { };
            loopPromise = (async () => {
                while (running && !disconnected && nativeConsumer.isConnected()) {
                    const messages = await new Promise((resolve) => {
                        if (!running || disconnected || !nativeConsumer.isConnected()) {
                            resolve([]);
                            return;
                        }
                        nativeConsumer.consume(fetchBatchSize, (err, msgs) => {
                            if (err) {
                                // Ignore timeout (-185 ERR__TIMED_OUT) or partition EOF (-191)
                                if (err.code !== -185 && err.code !== -191) {
                                    logger?.error('Kafka consume poll error', {
                                        groupId,
                                        code: err.code,
                                        error: err.message,
                                    });
                                }
                                resolve([]);
                                return;
                            }
                            resolve(msgs ?? []);
                        });
                    });
                    if (!running || disconnected)
                        break;
                    if (messages.length === 0)
                        continue;
                    if (runOpts.eachBatch) {
                        const byToppar = new Map();
                        for (const raw of messages) {
                            const key = `${raw.topic}:${raw.partition}`;
                            let group = byToppar.get(key);
                            if (!group) {
                                group = { topic: raw.topic, partition: raw.partition, msgs: [] };
                                byToppar.set(key, group);
                            }
                            group.msgs.push(toConsumedMessage(raw));
                        }
                        const batches = [...byToppar.values()];
                        const concurrency = Math.max(1, runOpts.partitionsConsumedConcurrently ?? 1);
                        for (let i = 0; i < batches.length; i += concurrency) {
                            const slice = batches.slice(i, i + concurrency);
                            await Promise.all(slice.map(async (b) => {
                                if (!running || disconnected)
                                    return;
                                while (running && !disconnected && nativeConsumer.isConnected()) {
                                    try {
                                        await runOpts.eachBatch({
                                            topic: b.topic, partition: b.partition, messages: b.msgs, heartbeat,
                                        });
                                        break;
                                    }
                                    catch (err) {
                                        logger?.error('Kafka consumer eachBatch handler error; retaining batch', {
                                            groupId, topic: b.topic, partition: b.partition,
                                            error: err instanceof Error ? err.message : String(err),
                                        });
                                        await new Promise((resolve) => setTimeout(resolve, 50));
                                    }
                                }
                            }));
                        }
                    }
                    else if (runOpts.eachMessage) {
                        for (const raw of messages) {
                            if (!running || disconnected)
                                break;
                            while (running && !disconnected && nativeConsumer.isConnected()) {
                                try {
                                    await runOpts.eachMessage({
                                        topic: raw.topic, partition: raw.partition,
                                        message: toConsumedMessage(raw), heartbeat,
                                    });
                                    break;
                                }
                                catch (err) {
                                    logger?.error('Kafka consumer eachMessage handler error; retaining message', {
                                        groupId, topic: raw.topic, partition: raw.partition, offset: String(raw.offset),
                                        error: err instanceof Error ? err.message : String(err),
                                    });
                                    await new Promise((resolve) => setTimeout(resolve, 50));
                                }
                            }
                        }
                    }
                }
            })();
        },
        async commitOffsets(offsets) {
            if (offsets.length === 0 || disconnected || !nativeConsumer.isConnected())
                return;
            const toppars = offsets.map((o) => ({
                topic: o.topic,
                partition: o.partition,
                offset: Number(o.offset),
            }));
            await new Promise((resolve, reject) => {
                nativeConsumer.commitCb(toppars, (err) => {
                    if (err) {
                        reject(new Error(err.message || 'Kafka offset commit failed'));
                        return;
                    }
                    resolve();
                });
            });
        },
        pause(topicPartitions) {
            const tps = [];
            for (const tp of topicPartitions) {
                const parts = tp.partitions ??
                    currentAssignment.filter((a) => a.topic === tp.topic).map((a) => a.partition);
                for (const partition of parts) {
                    pausedSet.add(`${tp.topic}:${partition}`);
                    tps.push({ topic: tp.topic, partition });
                }
            }
            if (tps.length > 0 && !disconnected && nativeConsumer.isConnected()) {
                try {
                    nativeConsumer.pause(tps);
                }
                catch {
                    // Ignore pause before assignment
                }
            }
        },
        resume(topicPartitions) {
            const tps = [];
            for (const tp of topicPartitions) {
                const parts = tp.partitions ??
                    currentAssignment.filter((a) => a.topic === tp.topic).map((a) => a.partition);
                for (const partition of parts) {
                    pausedSet.delete(`${tp.topic}:${partition}`);
                    tps.push({ topic: tp.topic, partition });
                }
            }
            if (tps.length > 0 && !disconnected && nativeConsumer.isConnected()) {
                try {
                    nativeConsumer.resume(tps);
                }
                catch {
                    // Ignore resume before assignment
                }
            }
        },
        async seek(tp) {
            if (disconnected || !nativeConsumer.isConnected())
                return;
            await new Promise((resolve, reject) => {
                nativeConsumer.seek({ topic: tp.topic, partition: tp.partition, offset: Number(tp.offset) }, 2_000, (err) => {
                    if (err)
                        reject(new Error(err.message || 'Kafka seek failed'));
                    else
                        resolve();
                });
            });
        },
        assignment() {
            return [...currentAssignment];
        },
        async stop() {
            running = false;
            if (loopPromise) {
                await loopPromise.catch(() => { });
                loopPromise = null;
            }
        },
        async disconnect() {
            await this.stop();
            if (disconnected)
                return;
            disconnected = true;
            consumers.delete(consumerWrapper);
            if (!nativeConsumer.isConnected())
                return;
            await new Promise((resolve) => {
                nativeConsumer.disconnect(() => resolve());
            });
        },
    };
    consumers.add(consumerWrapper);
    return consumerWrapper;
}
