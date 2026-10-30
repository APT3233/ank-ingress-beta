import RdKafka from '@confluentinc/kafka-javascript';
/** Builds the framework admin over an AdminClient sharing the native producer handle (once per client). */
export function createAdmin(state) {
    const { nativeProducer } = state;
    const nativeAdmin = RdKafka.AdminClient.createFrom(nativeProducer);
    const getMetadata = (options) => new Promise((resolve, reject) => {
        nativeProducer.getMetadata(options ?? { timeout: 5_000 }, (err, data) => {
            if (err) {
                reject(new Error(err.message || 'Failed to fetch Kafka metadata'));
                return;
            }
            resolve(data);
        });
    });
    const admin = {
        async listTopics(timeoutMs = 5_000) {
            const meta = await getMetadata({ timeout: timeoutMs });
            return meta.topics.map((t) => t.name);
        },
        async createTopics(options) {
            for (const t of options.topics) {
                await new Promise((resolve, reject) => {
                    nativeAdmin.createTopic({
                        topic: t.topic,
                        num_partitions: t.numPartitions ?? 1,
                        replication_factor: t.replicationFactor ?? 1,
                    }, 10_000, (err) => {
                        // ERR_TOPIC_ALREADY_EXISTS = 36
                        if (err && err.code !== 36) {
                            reject(new Error(err.message || `Failed to create topic ${t.topic}`));
                            return;
                        }
                        resolve();
                    });
                });
            }
            if (options.waitForLeaders !== false && options.topics.length > 0) {
                const deadline = Date.now() + 5_000;
                for (const t of options.topics) {
                    const expectedPartitions = t.numPartitions ?? 1;
                    while (Date.now() < deadline) {
                        const meta = await getMetadata({ topic: t.topic, timeout: 1_000 }).catch(() => null);
                        const topicMeta = meta?.topics.find((tm) => tm.name === t.topic);
                        if (topicMeta &&
                            topicMeta.partitions.length >= expectedPartitions &&
                            topicMeta.partitions.every((p) => p.leader >= 0)) {
                            break;
                        }
                        await new Promise((res) => setTimeout(res, 50));
                    }
                }
            }
        },
        async disconnect() {
            // AdminClient created via createFrom shares nativeProducer handle
        },
    };
    return admin;
}
