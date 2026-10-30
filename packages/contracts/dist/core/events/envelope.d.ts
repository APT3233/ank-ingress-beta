import type { EventSpec } from '../../types/catalog.types.js';
import type { CreateEnvelopeInput, EventEnvelope } from '../../types/envelope.types.js';
export declare function createEnvelope<T>(input: CreateEnvelopeInput<T>): EventEnvelope<T>;
export declare function upcastEnvelope<T = unknown>(envelope: EventEnvelope, spec: EventSpec): EventEnvelope<T>;
