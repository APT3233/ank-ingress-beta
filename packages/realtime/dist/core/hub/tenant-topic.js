export function tenantTopic(tenantId, topic) {
    return `t:${tenantId ?? 'global'}:${topic}`;
}
