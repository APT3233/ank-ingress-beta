import { AppError } from '@ank-ingress/kernel';
export function assertWithinDedupeWindow(dedupeWindowMs, receipt, occurredAtIso, allowExpired) {
    if (allowExpired)
        return;
    const now = Date.now();
    const createdAtMs = Date.parse(receipt.createdAt);
    if (Number.isFinite(createdAtMs) && now - createdAtMs > dedupeWindowMs) {
        throw new AppError('COMMON-409-CONFLICT', {
            message: `Receipt ${receipt.receiptId} is older than the dedupe window (${dedupeWindowMs}ms) and cannot be replayed by default`,
        });
    }
    if (occurredAtIso) {
        const occurredAtMs = Date.parse(occurredAtIso);
        if (Number.isFinite(occurredAtMs) && now - occurredAtMs > dedupeWindowMs) {
            throw new AppError('COMMON-409-CONFLICT', {
                message: `Event ${receipt.eventId ?? receipt.receiptId} occurred at ${occurredAtIso}, outside the dedupe window (${dedupeWindowMs}ms)`,
            });
        }
    }
}
