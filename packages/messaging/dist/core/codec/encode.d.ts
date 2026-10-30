import type { EventEnvelope } from '@ank-ingress/contracts';
import type { EncodeOptions, EncodedKafkaMessage } from '../../types/codec.types.js';
export declare function formatOutboxBrokerKey(rec: {
    readonly tenantId: number | null;
    readonly aggregateType: string;
    readonly aggregateId: string;
}): string;
export declare function encodeEnvelope(envelope: EventEnvelope, options: EncodeOptions): EncodedKafkaMessage;
