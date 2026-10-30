import { randomUUID } from 'node:crypto';
import { tenantTopic } from "./tenant-topic.js";
export function createRealtimeHub(options) {
    const instanceId = options.instanceId ?? randomUUID();
    const channel = options.channel ?? 'ank:realtime:fanout';
    let unsub;
    return {
        async start() {
            if (!options.bus || unsub)
                return;
            unsub = await options.bus.subscribe(channel, (raw) => {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed.origin === instanceId) {
                        // Ignore self-published messages to avoid duplicate delivery
                        return;
                    }
                    const fullTopic = tenantTopic(parsed.tenantId, parsed.topic);
                    options.httpApp.publish(fullTopic, parsed.message);
                }
                catch {
                    // Ignore malformed fanout payload
                }
            });
        },
        async stop() {
            if (unsub) {
                await unsub();
                unsub = undefined;
            }
        },
        async publish(tenantId, topic, message) {
            const fullTopic = tenantTopic(tenantId, topic);
            options.httpApp.publish(fullTopic, message);
            if (options.bus) {
                const env = {
                    origin: instanceId,
                    tenantId,
                    topic,
                    message,
                };
                await options.bus.publish(channel, JSON.stringify(env));
            }
        },
    };
}
