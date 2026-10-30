import assert from 'node:assert/strict';
export async function runIdempotencyStoreContractSuite(t, createFixture) {
    await t.test('claims fresh key, replays saved result, and detects payload mismatch', async () => {
        const fx = await createFixture();
        const key = {
            tenantId: 1,
            accountId: '1001',
            operation: 'notes.create',
            key: 'idem-001',
            requestHash: 'hash-aaa',
            ttlSeconds: 60,
        };
        const first = await fx.withTx((tx) => fx.store.claim(tx, key));
        assert.deepEqual(first, { kind: 'fresh' });
        const inProgress = await fx.withTx((tx) => fx.store.claim(tx, key));
        assert.deepEqual(inProgress, { kind: 'pending' });
        await fx.withTx((tx) => fx.store.save(tx, key, {
            status: 201,
            body: { id: 'note-1' },
        }));
        const replay = await fx.withTx((tx) => fx.store.claim(tx, key));
        assert.deepEqual(replay, {
            kind: 'replay',
            result: { status: 201, body: { id: 'note-1' } },
        });
        const mismatch = await fx.withTx((tx) => fx.store.claim(tx, {
            ...key,
            requestHash: 'hash-different',
        }));
        assert.deepEqual(mismatch, { kind: 'mismatch' });
        if (fx.advanceTimeMs) {
            await fx.advanceTimeMs(61_000);
            const afterExpiry = await fx.withTx((tx) => fx.store.claim(tx, {
                ...key,
                requestHash: 'hash-new-after-expiry',
            }));
            assert.deepEqual(afterExpiry, { kind: 'fresh' });
        }
    });
}
