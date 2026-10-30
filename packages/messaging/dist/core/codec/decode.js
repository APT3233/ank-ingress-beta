import { upcastEnvelope } from '@ank-ingress/contracts';
import { AppError } from '@ank-ingress/kernel';
import { normalizeKafkaHeaders } from "./headers.js";
import { getValidator } from "./validator-cache.js";
function extractRawKey(key) {
    if (key === undefined || key === null)
        return null;
    return Buffer.isBuffer(key) ? key.toString('utf8') : String(key);
}
function extractRawValue(value) {
    if (value === undefined || value === null)
        return null;
    return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}
const CANONICAL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_META = Object.freeze({
    eventId: null,
    eventType: null,
    eventVersion: null,
    tenantId: null,
    aggregateType: null,
    aggregateId: null,
    sequence: null,
    correlationId: null,
    traceparent: null,
});
export function classifyAndDecodeMessage(raw, catalogs) {
    const rawKey = extractRawKey(raw.key);
    const rawValue = extractRawValue(raw.value);
    const headers = normalizeKafkaHeaders(raw.headers);
    if (!rawValue || rawValue.length === 0) {
        return {
            kind: 'quarantine',
            errorCode: 'MALFORMED_MESSAGE',
            errorMessage: 'Empty Kafka message value',
            meta: EMPTY_META,
            rawKey,
            rawValue,
            headers,
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(rawValue);
    }
    catch {
        return {
            kind: 'quarantine',
            errorCode: 'MALFORMED_MESSAGE',
            errorMessage: 'Malformed JSON in Kafka message value',
            meta: EMPTY_META,
            rawKey,
            rawValue,
            headers,
        };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
            kind: 'quarantine',
            errorCode: 'MALFORMED_MESSAGE',
            errorMessage: 'Kafka message value must be a JSON object',
            meta: EMPTY_META,
            rawKey,
            rawValue,
            headers,
        };
    }
    const obj = parsed;
    const headerSeq = headers['aggregate-sequence'] ? Number(headers['aggregate-sequence']) : null;
    const rawSeq = typeof obj.sequence === 'number' && Number.isFinite(obj.sequence)
        ? obj.sequence
        : headerSeq !== null && Number.isFinite(headerSeq)
            ? headerSeq
            : null;
    const traceparent = headers.traceparent ?? (typeof obj.traceparent === 'string' ? obj.traceparent : null);
    const meta = {
        eventId: typeof obj.id === 'string' && obj.id.length > 0 ? obj.id : (headers['event-id'] ?? null),
        eventType: typeof obj.type === 'string' && obj.type.length > 0 ? obj.type : (headers['event-type'] ?? null),
        eventVersion: typeof obj.version === 'number' && Number.isInteger(obj.version) ? obj.version : null,
        tenantId: typeof obj.tenantId === 'number' && Number.isInteger(obj.tenantId) ? obj.tenantId : null,
        aggregateType: typeof obj.aggregateType === 'string' && obj.aggregateType.length > 0 ? obj.aggregateType : null,
        aggregateId: typeof obj.aggregateId === 'string' && obj.aggregateId.length > 0 ? obj.aggregateId : null,
        sequence: rawSeq,
        correlationId: typeof obj.correlationId === 'string' && obj.correlationId.length > 0
            ? obj.correlationId
            : (headers['correlation-id'] ?? null),
        traceparent,
    };
    if (!meta.eventType) {
        return {
            kind: 'quarantine',
            errorCode: 'MALFORMED_MESSAGE',
            errorMessage: 'Missing event type in Kafka message envelope',
            meta,
            rawKey,
            rawValue,
            headers,
        };
    }
    const spec = catalogs.events.spec(meta.eventType);
    if (!spec) {
        return {
            kind: 'quarantine',
            errorCode: 'UNKNOWN_EVENT_TYPE',
            errorMessage: `Unknown event type: ${meta.eventType}`,
            meta,
            rawKey,
            rawValue,
            headers,
        };
    }
    if (meta.eventVersion === null ||
        meta.eventVersion <= 0 ||
        meta.eventVersion > spec.version ||
        (meta.eventVersion < spec.version && typeof spec.upcast !== 'function')) {
        return {
            kind: 'quarantine',
            errorCode: 'UNSUPPORTED_EVENT_VERSION',
            errorMessage: `Unsupported event version for ${meta.eventType}: v${String(obj.version)} (expected v${spec.version})`,
            meta,
            rawKey,
            rawValue,
            headers,
        };
    }
    if (!meta.eventId || !meta.aggregateType || !meta.aggregateId) {
        return {
            kind: 'quarantine',
            errorCode: 'MALFORMED_MESSAGE',
            errorMessage: 'Missing required envelope identity fields (id, aggregateType, aggregateId)',
            meta,
            rawKey,
            rawValue,
            headers,
        };
    }
    if (!CANONICAL_UUID_RE.test(meta.eventId)) {
        return {
            kind: 'quarantine',
            errorCode: 'MALFORMED_MESSAGE',
            errorMessage: 'Event id must be a canonical UUID',
            meta,
            rawKey,
            rawValue,
            headers,
        };
    }
    const candidate = parsed;
    let upcasted;
    try {
        upcasted = upcastEnvelope(candidate, spec);
    }
    catch (err) {
        return {
            kind: 'quarantine',
            errorCode: 'UNSUPPORTED_EVENT_VERSION',
            errorMessage: `Failed to upcast ${meta.eventType}@v${meta.eventVersion}: ${err instanceof Error ? err.message : String(err)}`,
            meta,
            rawKey,
            rawValue,
            headers,
        };
    }
    const check = getValidator(spec);
    if (!check.Check(upcasted.payload)) {
        const first = check.Errors(upcasted.payload).First();
        return {
            kind: 'permanent_error',
            errorCode: 'INVALID_EVENT_PAYLOAD',
            errorMessage: `Invalid event payload for ${upcasted.type}@v${upcasted.version}: ${first?.path ?? ''} ${first?.message ?? ''}`,
            meta,
            rawKey,
            rawValue,
            headers,
        };
    }
    const normalizedEnvelope = Object.freeze({
        ...upcasted,
        ...(rawSeq !== null && upcasted.sequence === undefined ? { sequence: rawSeq } : {}),
        ...(traceparent && !upcasted.traceparent ? { traceparent } : {}),
    });
    return {
        kind: 'ok',
        decoded: {
            key: rawKey,
            envelope: normalizedEnvelope,
            traceparent,
            headers,
        },
        meta: {
            ...meta,
            eventVersion: normalizedEnvelope.version,
        },
        rawKey,
        rawValue,
        headers,
    };
}
export function decodeMessage(raw, catalogs) {
    const res = classifyAndDecodeMessage(raw, catalogs);
    if (res.kind !== 'ok') {
        throw new AppError('COMMON-422-VALIDATION', { message: res.errorMessage });
    }
    return res.decoded;
}
