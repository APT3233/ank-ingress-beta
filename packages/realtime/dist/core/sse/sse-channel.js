import { Readable } from 'node:stream';
import { Reply } from '@ank-ingress/contracts';
import { formatSseFrame } from "./sse-frame.js";
export function createSseChannel(options = {}) {
    const maxHistory = options.maxHistory ?? 256;
    const maxHistoryBytes = options.maxHistoryBytes ?? 1_048_576; // 1 MiB default
    const maxClientBufferBytes = options.maxClientBufferBytes ?? 262_144; // 256 KiB default
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
    const history = [];
    let historyBytes = 0;
    const subscribers = new Set();
    return {
        publish(id, event, data) {
            const formatted = formatSseFrame(id, event, data);
            const bytes = Buffer.byteLength(formatted, 'utf8');
            if (maxHistory > 0 && bytes <= maxHistoryBytes) {
                history.push({ id, event, formatted, bytes });
                historyBytes += bytes;
                while (history.length > maxHistory || historyBytes > maxHistoryBytes) {
                    const evicted = history.shift();
                    if (evicted) {
                        historyBytes -= evicted.bytes;
                    }
                }
            }
            else if (bytes > maxHistoryBytes) {
                history.length = 0;
                historyBytes = 0;
            }
            for (const sub of [...subscribers]) {
                sub(formatted, bytes);
            }
        },
        subscribe(subOpts) {
            let cleanedUp = false;
            let flowing = true;
            let queuedBytes = 0;
            const queue = [];
            let heartbeatTimer;
            let listener;
            const cleanup = () => {
                if (cleanedUp)
                    return;
                cleanedUp = true;
                queue.length = 0;
                queuedBytes = 0;
                subOpts.signal.removeEventListener('abort', onAbort);
                if (heartbeatTimer !== undefined) {
                    clearInterval(heartbeatTimer);
                    heartbeatTimer = undefined;
                }
                if (listener !== undefined) {
                    subscribers.delete(listener);
                    listener = undefined;
                }
            };
            const flushQueue = () => {
                if (cleanedUp)
                    return;
                flowing = true;
                while (queue.length > 0 && !cleanedUp) {
                    const next = queue.shift();
                    queuedBytes -= next.bytes;
                    if (!stream.push(next.text)) {
                        flowing = false;
                        break;
                    }
                }
            };
            const stream = new Readable({
                highWaterMark: 16 * 1024,
                read() {
                    flushQueue();
                },
                destroy(_err, cb) {
                    cleanup();
                    cb(null);
                },
            });
            const enqueue = (text, bytes = Buffer.byteLength(text, 'utf8')) => {
                if (cleanedUp)
                    return;
                if (bytes > maxClientBufferBytes || stream.readableLength + queuedBytes + bytes > maxClientBufferBytes) {
                    cleanup();
                    stream.destroy(new Error('SSE client buffer limit exceeded'));
                    return;
                }
                if (flowing && queue.length === 0) {
                    if (!stream.push(text)) {
                        flowing = false;
                    }
                    return;
                }
                queue.push({ text, bytes });
                queuedBytes += bytes;
            };
            const onAbort = () => {
                cleanup();
                stream.push(null);
            };
            // Initial comment frame to flush headers immediately
            enqueue(': connected\n\n');
            let resyncRequired = false;
            // Replay missed events after lastEventId if found in ring buffer, or emit resync signal if outside history
            if (subOpts.lastEventId !== undefined && subOpts.lastEventId !== '') {
                const idx = history.findIndex((item) => item.id === subOpts.lastEventId);
                let replayBytes = stream.readableLength + queuedBytes;
                if (idx !== -1) {
                    for (let i = idx + 1; i < history.length; i++) {
                        replayBytes += history[i].bytes;
                    }
                }
                if (idx !== -1 && replayBytes <= maxClientBufferBytes) {
                    for (let i = idx + 1; i < history.length; i++) {
                        const item = history[i];
                        enqueue(item.formatted, item.bytes);
                    }
                }
                else {
                    resyncRequired = true;
                    const resyncFrame = `event: resync\ndata: ${JSON.stringify({
                        reason: 'history_gap',
                        lastEventId: subOpts.lastEventId,
                    })}\n\n`;
                    enqueue(resyncFrame);
                }
            }
            if (!cleanedUp && !subOpts.signal.aborted) {
                listener = (formatted, bytes) => {
                    enqueue(formatted, bytes);
                };
                subscribers.add(listener);
                heartbeatTimer = setInterval(() => {
                    if (!cleanedUp && flowing && queue.length === 0) {
                        enqueue(': heartbeat\n\n');
                    }
                }, heartbeatIntervalMs);
                heartbeatTimer.unref?.();
                subOpts.signal.addEventListener('abort', onAbort, { once: true });
            }
            else if (subOpts.signal.aborted) {
                onAbort();
            }
            return Reply.stream(stream, {
                contentType: 'text/event-stream; charset=utf-8',
                headers: {
                    'cache-control': 'no-cache, no-transform',
                    'x-accel-buffering': 'no',
                    ...(resyncRequired ? { 'x-sse-resync-required': 'true' } : {}),
                },
            });
        },
    };
}
