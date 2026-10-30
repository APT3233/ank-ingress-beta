export function formatOutboxBrokerKey(rec) {
    return `${rec.tenantId ?? 'global'}:${rec.aggregateType}:${rec.aggregateId}`;
}
export function encodeEnvelope(envelope, options) {
    const headers = {
        'event-id': envelope.id,
        'correlation-id': envelope.correlationId,
        'event-type': envelope.type,
        'event-version': String(envelope.version),
    };
    if (envelope.sequence !== undefined) {
        headers['aggregate-sequence'] = String(envelope.sequence);
    }
    const traceparent = options.traceparent ?? envelope.traceparent ?? null;
    if (traceparent) {
        headers.traceparent = traceparent;
    }
    return {
        key: options.key,
        value: Buffer.from(JSON.stringify(envelope), 'utf8'),
        headers,
    };
}
