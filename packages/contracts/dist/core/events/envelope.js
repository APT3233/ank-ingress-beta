import { newUuid, toIsoTimestamp } from '@ank-ingress/kernel';
export function createEnvelope(input) {
    const occurredAt = typeof input.occurredAt === 'string'
        ? input.occurredAt
        : toIsoTimestamp(input.occurredAt ?? new Date());
    return Object.freeze({
        id: input.id ?? newUuid(),
        type: input.type,
        version: input.version,
        occurredAt,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
        tenantId: input.tenantId,
        correlationId: input.correlationId,
        ...(input.traceparent === undefined ? {} : { traceparent: input.traceparent }),
        payload: input.payload,
    });
}
export function upcastEnvelope(envelope, spec) {
    if (envelope.version === spec.version) {
        return envelope;
    }
    if (envelope.version > spec.version || !spec.upcast) {
        return envelope;
    }
    let currentVersion = envelope.version;
    let currentPayload = envelope.payload;
    while (currentVersion < spec.version) {
        const nextPayload = spec.upcast(currentVersion, currentPayload);
        currentPayload = nextPayload;
        currentVersion += 1;
    }
    return Object.freeze({
        ...envelope,
        version: currentVersion,
        payload: currentPayload,
    });
}
