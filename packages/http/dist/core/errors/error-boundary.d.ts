import { type Catalogs, type JsonReply } from '@ank-ingress/contracts';
import type { Logger } from '@ank-ingress/observability';
export declare function toReply(err: unknown, catalogs: Catalogs, correlationId: string, logger?: Logger): JsonReply;
