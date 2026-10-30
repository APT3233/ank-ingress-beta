export class InMemoryInboxStore {
    seen = new Set();
    async record(tx, consumer, eventId) {
        const key = `${consumer}:${eventId}`;
        if (this.seen.has(key)) {
            return false;
        }
        this.seen.add(key);
        const maybeTx = tx;
        if (maybeTx !== null && typeof maybeTx === 'object' && Array.isArray(maybeTx.onRollback)) {
            maybeTx.onRollback.push(() => {
                this.seen.delete(key);
            });
        }
        return true;
    }
    async withTx(fn) {
        const tx = {
            onRollback: [],
            onCommit: [],
            onFinally: [],
        };
        try {
            const res = await fn(tx);
            for (const commit of tx.onCommit) {
                commit();
            }
            return res;
        }
        catch (err) {
            for (const undo of [...tx.onRollback].reverse()) {
                undo();
            }
            throw err;
        }
        finally {
            for (const fin of tx.onFinally) {
                fin();
            }
        }
    }
}
