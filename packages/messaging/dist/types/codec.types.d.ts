import type { EventEnvelope } from '@ank-ingress/contracts';
export interface EncodedKafkaMessage {
    readonly key: string;
    readonly value: Buffer;
    readonly headers: Readonly<Record<string, string>>;
}
export interface EncodeOptions {
    readonly key: string;
    readonly traceparent?: string | null;
}
export type RawKafkaHeaderInput = Readonly<Record<string, Buffer | string | (Buffer | string)[] | undefined>> | readonly Readonly<Record<string, Buffer | string | undefined>>[];
export interface RawKafkaMessage {
    readonly key?: Buffer | string | null;
    readonly value: Buffer | string | null;
    readonly headers?: RawKafkaHeaderInput;
}
export interface DecodedKafkaMessage {
    readonly key: string | null;
    readonly envelope: EventEnvelope;
    readonly traceparent: string | null;
    readonly headers: Readonly<Record<string, string>>;
}
export interface PartialEnvelopeMetadata {
    readonly eventId: string | null;
    readonly eventType: string | null;
    readonly eventVersion: number | null;
    readonly tenantId: number | null;
    readonly aggregateType: string | null;
    readonly aggregateId: string | null;
    readonly sequence: number | null;
    readonly correlationId: string | null;
    readonly traceparent: string | null;
}
export type DecodeClassification = {
    readonly kind: 'ok';
    readonly decoded: DecodedKafkaMessage;
    readonly meta: PartialEnvelopeMetadata;
    readonly rawKey: string | null;
    readonly rawValue: string | null;
    readonly headers: Readonly<Record<string, string>>;
} | {
    readonly kind: 'quarantine';
    readonly errorCode: 'MALFORMED_MESSAGE' | 'UNKNOWN_EVENT_TYPE' | 'UNSUPPORTED_EVENT_VERSION';
    readonly errorMessage: string;
    readonly meta: PartialEnvelopeMetadata;
    readonly rawKey: string | null;
    readonly rawValue: string | null;
    readonly headers: Readonly<Record<string, string>>;
} | {
    readonly kind: 'permanent_error';
    readonly errorCode: 'INVALID_EVENT_PAYLOAD';
    readonly errorMessage: string;
    readonly meta: PartialEnvelopeMetadata;
    readonly rawKey: string | null;
    readonly rawValue: string | null;
    readonly headers: Readonly<Record<string, string>>;
};
