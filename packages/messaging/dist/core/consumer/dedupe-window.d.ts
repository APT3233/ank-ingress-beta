import type { ConsumerReceiptRecord } from '@ank-ingress/contracts';
export declare function assertWithinDedupeWindow(dedupeWindowMs: number, receipt: ConsumerReceiptRecord, occurredAtIso: string | undefined, allowExpired: boolean | undefined): void;
