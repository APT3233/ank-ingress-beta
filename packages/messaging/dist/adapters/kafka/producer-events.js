/** Registers the producer error/log/stats/delivery-report listeners (before connect). */
export function attachProducerEvents(state) {
    const { config, logger, nativeProducer } = state;
    nativeProducer.on('event.error', (err) => {
        logger?.error('Kafka producer event.error', {
            clientId: config.clientId,
            code: err.code,
            origin: err.origin,
            error: err.message,
        });
    });
    nativeProducer.on('event.log', (ev) => {
        if (ev && typeof ev.severity === 'number' && ev.severity <= 4) {
            if (ev.severity <= 3) {
                logger?.error('Kafka producer log', {
                    clientId: config.clientId,
                    fac: ev.fac,
                    message: ev.message,
                });
            }
            else {
                logger?.warn('Kafka producer log', {
                    clientId: config.clientId,
                    fac: ev.fac,
                    message: ev.message,
                });
            }
        }
    });
    nativeProducer.on('event.stats', (ev) => {
        if (!ev?.message)
            return;
        try {
            const parsed = JSON.parse(ev.message);
            if (typeof parsed.txmsgs === 'number') {
                state.txMessages = Math.max(state.txMessages, parsed.txmsgs);
            }
            if (typeof parsed.tx === 'number') {
                state.txRequests = Math.max(state.txRequests, parsed.tx);
            }
            if (parsed.brokers && typeof parsed.brokers === 'object') {
                let brokerTx = 0;
                let brokerTxMsgs = 0;
                for (const b of Object.values(parsed.brokers)) {
                    if (typeof b?.tx === 'number')
                        brokerTx += b.tx;
                    if (typeof b?.txmsgs === 'number')
                        brokerTxMsgs += b.txmsgs;
                }
                state.txMessages = Math.max(state.txMessages, brokerTxMsgs);
                state.txRequests = Math.max(state.txRequests, brokerTx);
            }
        }
        catch {
            // Ignore malformed stats payload
        }
    });
    nativeProducer.on('delivery-report', (err, report) => {
        const opaque = report?.opaque;
        if (!opaque || opaque.settled)
            return;
        opaque.settled = true;
        if (err) {
            const error = new Error(err.message || 'Kafka delivery failed');
            logger?.error('Kafka delivery report error', {
                clientId: config.clientId,
                topic: report?.topic ?? opaque.topic,
                partition: report?.partition ?? -1,
                code: err.code,
                error: error.message,
            });
            opaque.resolve({
                index: opaque.index,
                topic: report?.topic ?? opaque.topic,
                partition: report?.partition ?? -1,
                offset: null,
                opaque: opaque.userOpaque,
                error,
            });
        }
        else {
            opaque.resolve({
                index: opaque.index,
                topic: report?.topic ?? opaque.topic,
                partition: report?.partition ?? 0,
                offset: typeof report?.offset === 'number' ? report.offset : null,
                opaque: opaque.userOpaque,
                error: null,
            });
        }
    });
}
