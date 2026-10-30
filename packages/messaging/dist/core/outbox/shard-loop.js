import { createEnvelope } from '@ank-ingress/contracts';
import { encodeEnvelope, formatOutboxBrokerKey } from "../codec/encode.js";
import { deliverBatch, fetchAcrossLeases, releaseLeaseList } from "./publisher-io.js";
/** One shard-loop tick: lease, fetch, publish, mark, release, then reschedule itself. */
export async function tick(state) {
    const { options, tracker, maxShards, leaseTtlMs, batchSize, pollIntervalMs, maxBackoffMs, maxAttempts } = state;
    if (state.stopping) {
        return;
    }
    const leave = tracker.enter();
    let publishedCount = 0;
    let failedCount = 0;
    let tickError = false;
    let retainLeasesForNextTick = false;
    let renewInterval;
    try {
        let leased;
        const now = Date.now();
        const canReuseHeldLeases = maxShards >= 64 &&
            state.activeLeases.length === maxShards &&
            state.activeLeases.every((l) => l.expiresAt.getTime() - now > Math.floor(leaseTtlMs / 2));
        if (canReuseHeldLeases) {
            leased = state.activeLeases;
        }
        else {
            if (state.activeLeases.length > 0) {
                const prev = [...state.activeLeases];
                state.activeLeases = [];
                await releaseLeaseList(state, prev);
            }
            leased = await options.store.lease(options.owner, maxShards, leaseTtlMs);
            state.activeLeases = [...leased];
        }
        if (state.stopping || leased.length === 0) {
            return;
        }
        const records = await fetchAcrossLeases(state, leased);
        if (state.stopping || records.length === 0) {
            return;
        }
        const fullHotBatch = maxShards >= 64 && leased.length === maxShards && records.length >= batchSize;
        let workingLeases;
        if (fullHotBatch) {
            workingLeases = leased;
        }
        else {
            const shardsWithWork = new Set(records.map((r) => r.shardId));
            const emptyLeases = leased.filter((l) => !shardsWithWork.has(l.shardId));
            workingLeases = leased.filter((l) => shardsWithWork.has(l.shardId));
            state.activeLeases = [...workingLeases];
            await releaseLeaseList(state, emptyLeases);
        }
        const leaseByShard = new Map(workingLeases.map((l) => [l.shardId, l]));
        if ((options.store.renewBatch || options.store.renew) && workingLeases.length > 0) {
            const renewPeriodMs = Math.max(25, Math.floor(leaseTtlMs / 3));
            renewInterval = setInterval(() => {
                if (state.stopping || state.activeLeases.length === 0)
                    return;
                if (options.store.renewBatch) {
                    void options.store.renewBatch(state.activeLeases, leaseTtlMs).catch((err) => {
                        options.logger?.warn('Outbox shard batch lease renewal failed', {
                            owner: options.owner,
                            shardCount: state.activeLeases.length,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                    return;
                }
                for (const lease of state.activeLeases) {
                    void options.store.renew(lease, leaseTtlMs).catch((err) => {
                        options.logger?.warn('Outbox shard lease renewal failed', {
                            owner: options.owner,
                            shardId: lease.shardId,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                }
            }, renewPeriodMs);
            renewInterval.unref?.();
        }
        const messages = records.map((rec) => {
            const eventId = rec.eventId ?? rec.id;
            const env = createEnvelope({
                id: eventId,
                type: rec.eventType,
                version: rec.eventVersion,
                aggregateType: rec.aggregateType,
                aggregateId: rec.aggregateId,
                ...(rec.sequence !== undefined ? { sequence: rec.sequence } : {}),
                tenantId: rec.tenantId,
                correlationId: rec.correlationId,
                traceparent: rec.traceparent,
                occurredAt: rec.occurredAt,
                payload: rec.payload,
            });
            const encoded = encodeEnvelope(env, {
                key: formatOutboxBrokerKey(rec),
                traceparent: rec.traceparent,
            });
            return {
                topic: rec.topic,
                key: encoded.key,
                value: encoded.value,
                headers: encoded.headers,
            };
        });
        let deliveryResults;
        try {
            deliveryResults = await deliverBatch(state, messages);
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            options.logger?.error('Outbox batch publish failed', {
                owner: options.owner,
                batchSize: records.length,
                error: errMsg,
            });
            deliveryResults = records.map((r, index) => ({
                index,
                topic: r.topic,
                partition: -1,
                offset: null,
                error: err instanceof Error ? err : new Error(errMsg),
            }));
        }
        if (options.beforeMarkPublished) {
            await options.beforeMarkPublished(records);
        }
        const publishedByShard = new Map();
        const failedByShard = new Map();
        for (let i = 0; i < records.length; i++) {
            const rec = records[i];
            const recordId = rec.recordId ?? rec.id;
            const res = deliveryResults[i];
            const err = res?.error ?? null;
            if (err === null) {
                let list = publishedByShard.get(rec.shardId);
                if (!list) {
                    list = [];
                    publishedByShard.set(rec.shardId, list);
                }
                list.push(recordId);
            }
            else {
                let list = failedByShard.get(rec.shardId);
                if (!list) {
                    list = [];
                    failedByShard.set(rec.shardId, list);
                }
                list.push({ rec, recordId, error: err });
            }
        }
        if (options.store.markPublishedBatch && publishedByShard.size > 0) {
            const batchEntries = [];
            for (const [shardId, pubIds] of publishedByShard.entries()) {
                const lease = leaseByShard.get(shardId);
                if (lease && pubIds.length > 0) {
                    batchEntries.push({ lease, recordIds: pubIds });
                }
            }
            if (batchEntries.length > 0) {
                publishedCount += await options.store.markPublishedBatch(batchEntries);
            }
        }
        for (const [shardId, lease] of leaseByShard.entries()) {
            if (!options.store.markPublishedBatch) {
                const pubIds = publishedByShard.get(shardId);
                if (pubIds && pubIds.length > 0) {
                    const marked = await options.store.markPublished(lease, pubIds);
                    if (marked) {
                        publishedCount += pubIds.length;
                    }
                    else {
                        options.logger?.warn('Outbox markPublished rejected due to stale fencing token', {
                            owner: options.owner,
                            shardId: lease.shardId,
                            fencingToken: String(lease.fencingToken),
                            count: pubIds.length,
                        });
                    }
                }
            }
            const fails = failedByShard.get(shardId);
            if (fails && fails.length > 0) {
                for (const item of fails) {
                    failedCount += 1;
                    const dead = item.rec.attempts + 1 >= maxAttempts;
                    options.logger?.error('Outbox record delivery failed', {
                        owner: options.owner,
                        shardId: lease.shardId,
                        recordId: item.recordId,
                        eventId: item.rec.eventId ?? item.rec.id,
                        aggregateType: item.rec.aggregateType,
                        aggregateId: item.rec.aggregateId,
                        attempts: item.rec.attempts + 1,
                        dead,
                        error: item.error.message,
                    });
                    await options.store.markFailed(lease, item.recordId, item.error.message, dead);
                }
            }
        }
        if (fullHotBatch &&
            publishedCount >= batchSize &&
            failedCount === 0 &&
            !state.stopping &&
            !options.beforeMarkPublished) {
            retainLeasesForNextTick = true;
        }
    }
    catch (err) {
        tickError = true;
        options.logger?.error('Outbox publisher tick error', {
            owner: options.owner,
            error: err instanceof Error ? err.message : String(err),
        });
    }
    finally {
        if (renewInterval !== undefined) {
            clearInterval(renewInterval);
        }
        if (state.activeLeases.length > 0 && (!retainLeasesForNextTick || state.stopping || tickError)) {
            const remaining = [...state.activeLeases];
            state.activeLeases = [];
            await releaseLeaseList(state, remaining);
        }
        leave();
        if (!state.stopping) {
            let nextDelayMs = pollIntervalMs;
            if (tickError || (failedCount > 0 && publishedCount === 0)) {
                state.consecutiveFailures += 1;
                const exp = Math.min(maxBackoffMs, pollIntervalMs * Math.pow(2, Math.min(state.consecutiveFailures, 6)));
                const jitter = Math.floor(Math.random() * Math.min(50, pollIntervalMs));
                nextDelayMs = Math.min(maxBackoffMs, exp + jitter);
            }
            else if (publishedCount > 0 && failedCount === 0) {
                state.consecutiveFailures = 0;
                nextDelayMs = 0;
            }
            else {
                state.consecutiveFailures = 0;
                nextDelayMs = pollIntervalMs;
            }
            state.timer = setTimeout(() => {
                void tick(state);
            }, nextDelayMs);
            state.timer.unref?.();
        }
    }
}
