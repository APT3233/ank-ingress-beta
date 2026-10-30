import { fromRdKafkaHeaders } from "./headers.js";
export const toConsumedMessage = (m) => ({
    key: m.key === undefined || m.key === null
        ? null
        : Buffer.isBuffer(m.key)
            ? m.key
            : Buffer.from(String(m.key), 'utf8'),
    value: m.value ?? null,
    headers: fromRdKafkaHeaders(m.headers),
    offset: String(m.offset),
    timestamp: String(m.timestamp ?? Date.now()),
    size: m.size ?? (m.value ? m.value.byteLength : 0),
});
