export function createPubSubBus(bundle) {
    const handlersByChannel = new Map();
    const listenerByChannel = new Map();
    const subscribedOnSub = new Set();
    let healthy = bundle.sub.isReady;
    const dispatch = (channel, message) => {
        const handlers = handlersByChannel.get(channel);
        if (!handlers)
            return;
        for (const h of handlers) {
            try {
                h(message);
            }
            catch {
                // Handler errors must not break the subscriber loop
            }
        }
    };
    const getChannelListener = (channel) => {
        let listener = listenerByChannel.get(channel);
        if (!listener) {
            listener = (msg) => dispatch(channel, msg);
            listenerByChannel.set(channel, listener);
        }
        return listener;
    };
    const syncingByChannel = new Map();
    const reconcile = (channel) => {
        const previous = syncingByChannel.get(channel) ?? Promise.resolve();
        const next = previous.catch(() => { }).then(async () => {
            while (bundle.sub.isReady) {
                const wanted = (handlersByChannel.get(channel)?.size ?? 0) > 0;
                const subscribed = subscribedOnSub.has(channel);
                if (wanted === subscribed)
                    return;
                const listener = getChannelListener(channel);
                if (wanted) {
                    subscribedOnSub.add(channel);
                    try {
                        // Once acknowledged, node-redis owns this identity until unsubscribe succeeds.
                        await bundle.sub.subscribe(channel, listener);
                    }
                    catch (error) {
                        subscribedOnSub.delete(channel);
                        throw error;
                    }
                }
                else {
                    await bundle.sub.unsubscribe(channel, listener);
                    subscribedOnSub.delete(channel);
                    if (!handlersByChannel.has(channel))
                        listenerByChannel.delete(channel);
                }
            }
        });
        syncingByChannel.set(channel, next);
        void next.finally(() => {
            if (syncingByChannel.get(channel) === next)
                syncingByChannel.delete(channel);
        }).catch(() => { });
        return next;
    };
    bundle.sub.on('ready', () => {
        healthy = true;
        // Reconcile offline removals using the exact native listener identity.
        for (const channel of new Set([...handlersByChannel.keys(), ...subscribedOnSub])) {
            void reconcile(channel).catch(() => { });
        }
    });
    bundle.sub.on('end', () => {
        healthy = false;
    });
    bundle.sub.on('error', () => {
        if (!bundle.sub.isReady) {
            healthy = false;
        }
    });
    return {
        async publish(channel, payload) {
            await bundle.cmd.publish(channel, payload);
        },
        async subscribe(channel, handler) {
            let set = handlersByChannel.get(channel);
            if (!set) {
                set = new Set();
                handlersByChannel.set(channel, set);
            }
            set.add(handler);
            if (bundle.sub.isReady) {
                try {
                    await reconcile(channel);
                }
                catch (err) {
                    set.delete(handler);
                    if (set.size === 0)
                        handlersByChannel.delete(channel);
                    throw err;
                }
            }
            return async () => {
                const current = handlersByChannel.get(channel);
                if (!current)
                    return;
                current.delete(handler);
                if (current.size === 0) {
                    handlersByChannel.delete(channel);
                    if (bundle.sub.isReady)
                        await reconcile(channel).catch(() => { });
                    // Offline: preserve native registration and listener until ready reconciles it.
                }
            };
        },
        isHealthy() {
            return healthy && bundle.sub.isReady;
        },
    };
}
