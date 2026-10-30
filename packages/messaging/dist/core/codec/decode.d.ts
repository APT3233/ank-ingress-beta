import { type Catalogs } from '@ank-ingress/contracts';
import type { DecodeClassification, DecodedKafkaMessage, RawKafkaMessage } from '../../types/codec.types.js';
export declare function classifyAndDecodeMessage(raw: RawKafkaMessage, catalogs: Catalogs): DecodeClassification;
export declare function decodeMessage(raw: RawKafkaMessage, catalogs: Catalogs): DecodedKafkaMessage;
