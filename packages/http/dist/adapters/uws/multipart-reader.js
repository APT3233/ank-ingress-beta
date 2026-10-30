import { Readable } from 'node:stream';
import { AppError } from '@ank-ingress/kernel';
import { multipartBoundary } from "../../core/multipart/boundary.js";
import { MultipartParser } from "../../core/multipart/multipart-parser.js";
import { STATE_OPEN } from "./request-state.js";
async function readText(stream, maxBytes) {
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > maxBytes) {
            stream.destroy();
            throw new AppError('COMMON-413-PAYLOAD_TOO_LARGE', { message: 'Multipart field too large' });
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks, size).toString('utf8');
}
/**
 * Streams a multipart body without buffering it: the socket is paused until the handler iterates,
 * and paused again whenever the current part's stream is full (uWS `pause`/`resume` backpressure).
 * Must be started synchronously in the uWS route callback, like any body reader.
 */
export function startMultipartReader(res, ctx, maxBodyBytes, limits) {
    ctx.bodyComplete = false;
    const pending = [];
    const ready = [];
    let received = 0;
    let ended = false;
    let started = false;
    let finished = false;
    let failure = null;
    let paused = true;
    let pumping = false;
    let pumpAgain = false;
    let parser = null;
    let current = null;
    let handedOut = null;
    let waiter = null;
    const writable = () => ctx.state === STATE_OPEN && !ctx.aborted;
    const blocked = () => current !== null && current.needDrain && !current.discarding && !current.stream.destroyed;
    /**
     * uWS pause/resume acts on the socket, so once the body has fully arrived it must be resumed or the
     * next keep-alive request stalls. Before that, read only while the handler is consuming parts.
     */
    const syncFlow = () => {
        const flow = ended || (started && failure === null && !blocked());
        if (flow === !paused || !writable())
            return;
        paused = !flow;
        if (flow)
            res.resume();
        else
            res.pause();
    };
    const fail = (err) => {
        if (failure !== null)
            return;
        failure = err;
        pending.length = 0;
        for (const state of [current, handedOut, ...ready]) {
            if (state !== null && !state.ended && !state.stream.destroyed)
                state.stream.destroy(err);
        }
        ready.length = 0;
        syncFlow();
        const w = waiter;
        waiter = null;
        w?.reject(err);
    };
    const deliver = (state) => {
        if (waiter !== null) {
            const w = waiter;
            waiter = null;
            handedOut = state;
            w.resolve({ value: state.part, done: false });
        }
        else {
            ready.push(state);
        }
    };
    const events = {
        partBegin(info) {
            const state = {
                part: undefined,
                stream: new Readable({
                    read() {
                        if (state.needDrain) {
                            state.needDrain = false;
                            pump();
                        }
                    },
                }),
                ended: false,
                discarding: false,
                needDrain: false,
            };
            state.part = {
                name: info.name,
                filename: info.filename,
                contentType: info.contentType,
                stream: state.stream,
                text: () => readText(state.stream, limits.maxFieldBytes),
            };
            current = state;
            deliver(state);
        },
        partData(chunk) {
            const state = current;
            if (state.discarding || state.stream.destroyed)
                return;
            if (!state.stream.push(chunk))
                state.needDrain = true;
        },
        partEnd() {
            const state = current;
            state.ended = true;
            if (!state.discarding && !state.stream.destroyed)
                state.stream.push(null);
            current = null;
        },
    };
    function pump() {
        if (pumping) {
            pumpAgain = true;
            return;
        }
        pumping = true;
        try {
            do {
                pumpAgain = false;
                if (!started || failure !== null || parser === null)
                    break;
                while (pending.length > 0 && !blocked())
                    parser.write(pending.shift());
                if (pending.length === 0 && ended && !finished) {
                    parser.finish();
                    finished = true;
                    const w = waiter;
                    waiter = null;
                    w?.resolve({ value: undefined, done: true });
                }
            } while (pumpAgain);
        }
        catch (err) {
            pumping = false;
            fail(err);
            return;
        }
        pumping = false;
        syncFlow();
    }
    res.pause();
    res.onData((ab, isLast) => {
        if (failure !== null)
            return;
        received += ab.byteLength;
        if (received > maxBodyBytes) {
            fail(new AppError('COMMON-413-PAYLOAD_TOO_LARGE', { message: 'Request payload exceeds maximum allowed size' }));
            return;
        }
        // uWS neuters the ArrayBuffer after this callback, so the bytes are copied once here.
        if (ab.byteLength > 0)
            pending.push(Buffer.from(Buffer.from(ab)));
        if (isLast) {
            ended = true;
            ctx.bodyComplete = true;
        }
        pump();
    });
    ctx.onAbort(() => fail(new AppError('COMMON-503-UNAVAILABLE', { message: 'Request aborted while reading body' })));
    return {
        get finished() {
            return finished;
        },
        cancel() {
            fail(new AppError('COMMON-503-UNAVAILABLE', { message: 'Multipart reading cancelled' }));
        },
        parts() {
            if (started)
                throw new TypeError('req.parts() can only be iterated once');
            started = true;
            const boundary = multipartBoundary(ctx.headers['content-type']);
            if (boundary === null) {
                fail(new AppError('COMMON-415-UNSUPPORTED_MEDIA_TYPE', { message: 'Expected Content-Type: multipart/form-data with a boundary' }));
            }
            else {
                parser = new MultipartParser(boundary, limits, events);
            }
            pump();
            const iterator = {
                next() {
                    // Asking for the next part abandons whatever is left of the previous one.
                    const previous = handedOut;
                    handedOut = null;
                    if (previous !== null && !previous.ended && !previous.discarding) {
                        previous.discarding = true;
                        previous.stream.destroy();
                    }
                    const next = ready.shift();
                    if (next !== undefined) {
                        handedOut = next;
                        pump();
                        return Promise.resolve({ value: next.part, done: false });
                    }
                    if (failure !== null)
                        return Promise.reject(failure);
                    if (finished)
                        return Promise.resolve({ value: undefined, done: true });
                    return new Promise((resolve, reject) => {
                        waiter = { resolve, reject };
                        pump();
                    });
                },
                return() {
                    if (!finished)
                        fail(new AppError('COMMON-503-UNAVAILABLE', { message: 'Multipart reading stopped early' }));
                    return Promise.resolve({ value: undefined, done: true });
                },
                [Symbol.asyncIterator]() {
                    return iterator;
                },
            };
            return iterator;
        },
    };
}
