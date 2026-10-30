import assert from 'node:assert/strict';
import { test } from 'node:test';
export function runOutboxInboxContractSuite(options) {
    test(`${options.name} › InboxStore deduplicates (consumer, eventId)`, async () => {
        const inbox = options.createInbox();
        const first = await options.withTx((tx) => inbox.record(tx, 'audit-projection', '018f0000-0000-7000-8000-000000000001'));
        assert.equal(first, true);
        const second = await options.withTx((tx) => inbox.record(tx, 'audit-projection', '018f0000-0000-7000-8000-000000000001'));
        assert.equal(second, false);
        const otherConsumer = await options.withTx((tx) => inbox.record(tx, 'other-consumer', '018f0000-0000-7000-8000-000000000001'));
        assert.equal(otherConsumer, true);
    });
    test(`${options.name} › OutboxStore enforces fencing token on markPublished`, async () => {
        const { store, seed } = options.createOutbox();
        await seed({
            recordId: '10',
            eventId: '018f0000-0000-7000-8000-000000000010',
            id: '10',
            shardId: 0,
            topic: 'ank.notes.events',
            aggregateType: 'note',
            aggregateId: 'note-1',
            sequence: 1,
            tenantId: 1,
            eventType: 'notes.note.created',
            eventVersion: 1,
            correlationId: 'corr-1',
            traceparent: null,
            payload: { id: 'note-1' },
            occurredAt: new Date().toISOString(),
            attempts: 0,
        });
        const leasesA = await store.lease('worker-a', 1, 10);
        assert.equal(leasesA.length, 1);
        const staleLease = leasesA[0];
        // Wait for lease expiry so worker-b can steal shard 0 with a higher fencing token
        await new Promise((res) => setTimeout(res, 25));
        const leasesB = await store.lease('worker-b', 1, 5000);
        assert.equal(leasesB.length, 1);
        const activeLease = leasesB[0];
        assert.ok(activeLease.fencingToken > staleLease.fencingToken);
        const staleMarked = await store.markPublished(staleLease, ['10']);
        assert.equal(staleMarked, false, 'stale fencing token must not mark published');
        const activeMarked = await store.markPublished(activeLease, ['10']);
        assert.equal(activeMarked, true, 'current fencing token marks published');
    });
}
