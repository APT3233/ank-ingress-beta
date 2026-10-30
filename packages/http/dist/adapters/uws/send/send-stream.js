import { STATE_OPEN, STATE_SENT } from "../request-state.js";
import { HEADER_CONTENT_TYPE, HEADER_CORRELATION_ID, assertHeaderValue, assertHeaders, writeDecor, writeHeaders } from "./header-writers.js";
import { statusLine } from "./status-line.js";
export function sendStream(res, ctx, reply, isHead = false) {
    if (ctx.state !== STATE_OPEN) {
        reply.body.destroy();
        return Promise.resolve();
    }
    try {
        assertHeaderValue(reply.contentType);
        if (reply.headers !== undefined)
            assertHeaders(reply.headers);
    }
    catch (error) {
        reply.body.destroy();
        throw error;
    }
    ctx.state = STATE_SENT;
    const status = reply.status ?? 200;
    const stream = reply.body;
    const totalSize = reply.size;
    if (isHead) {
        stream.destroy();
        res.cork(() => {
            res.writeStatus(statusLine(status));
            res.writeHeader(HEADER_CONTENT_TYPE, reply.contentType);
            if (ctx.correlationHeader) {
                res.writeHeader(HEADER_CORRELATION_ID, ctx.correlationHeader);
            }
            writeHeaders(res, reply.headers);
            writeDecor(res, ctx, reply.headers);
            if (reply.headers?.['content-length']) {
                res.endWithoutBody();
            }
            else {
                res.endWithoutBody(totalSize ?? 0);
            }
        });
        return Promise.resolve();
    }
    res.cork(() => {
        res.writeStatus(statusLine(status));
        res.writeHeader(HEADER_CONTENT_TYPE, reply.contentType);
        if (ctx.correlationHeader) {
            res.writeHeader(HEADER_CORRELATION_ID, ctx.correlationHeader);
        }
        writeHeaders(res, reply.headers);
        writeDecor(res, ctx, reply.headers);
    });
    return new Promise((resolve) => {
        let finished = false;
        const cleanup = () => {
            if (finished)
                return;
            finished = true;
            stream.destroy();
            resolve();
        };
        ctx.onAbort(() => {
            if (!ctx.socketAborted && !finished) {
                if (totalSize !== undefined) {
                    res.close();
                }
                else {
                    res.cork(() => {
                        res.end();
                    });
                }
            }
            cleanup();
        });
        if (totalSize === 0) {
            res.cork(() => { res.endWithoutBody(0); });
            cleanup();
            return;
        }
        let sourceBytes = 0;
        let awaitingSizedWrite = false;
        const finalSizedWritePending = () => awaitingSizedWrite && sourceBytes === totalSize;
        stream.once('close', () => {
            // Readable auto-destroy may precede the native socket's final writable callback.
            if (stream.readableEnded && finalSizedWritePending())
                return;
            if (!finished) {
                if (!ctx.socketAborted)
                    res.close();
                cleanup();
            }
        });
        if (totalSize !== undefined) {
            let lastChunk = null;
            let lastOffset = 0;
            stream.on('data', (raw) => {
                if (finished || ctx.aborted)
                    return;
                const chunk = typeof raw === 'string' ? Buffer.from(raw) : raw;
                const arrayBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
                sourceBytes += chunk.byteLength;
                const prevOffset = res.getWriteOffset();
                let ok = false;
                let done = false;
                res.cork(() => {
                    [ok, done] = res.tryEnd(arrayBuffer, totalSize);
                });
                if (done) {
                    cleanup();
                }
                else if (!ok) {
                    stream.pause();
                    lastChunk = chunk;
                    lastOffset = prevOffset;
                    awaitingSizedWrite = true;
                    res.onWritable((offset) => {
                        if (finished || ctx.aborted || !lastChunk)
                            return true;
                        const remaining = lastChunk.subarray(offset - lastOffset);
                        const remAb = remaining.buffer.slice(remaining.byteOffset, remaining.byteOffset + remaining.byteLength);
                        let writeOk = false;
                        let writeDone = false;
                        res.cork(() => {
                            [writeOk, writeDone] = res.tryEnd(remAb, totalSize);
                        });
                        if (writeDone) {
                            awaitingSizedWrite = false;
                            cleanup();
                        }
                        else if (writeOk) {
                            awaitingSizedWrite = false;
                            lastChunk = null;
                            stream.resume();
                        }
                        return writeOk;
                    });
                }
            });
            stream.on('end', () => {
                if (!finished && finalSizedWritePending())
                    return;
                if (!finished && !ctx.socketAborted)
                    res.close();
                cleanup();
            });
            stream.on('error', () => {
                if (!ctx.socketAborted && !finished) {
                    res.close();
                }
                cleanup();
            });
        }
        else {
            // Chunked streaming (unknown total size, e.g. SSE or dynamic stream)
            stream.on('data', (raw) => {
                if (finished || ctx.aborted)
                    return;
                const chunk = typeof raw === 'string' ? Buffer.from(raw) : raw;
                const arrayBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
                let ok = false;
                res.cork(() => {
                    ok = res.write(arrayBuffer);
                });
                if (!ok) {
                    stream.pause();
                    res.onWritable(() => {
                        if (!finished && !ctx.aborted) {
                            stream.resume();
                        }
                        return true;
                    });
                }
            });
            stream.on('end', () => {
                if (!finished && !ctx.socketAborted) {
                    res.cork(() => {
                        res.end();
                    });
                }
                cleanup();
            });
            stream.on('error', () => {
                if (!ctx.socketAborted && !finished) {
                    res.close();
                }
                cleanup();
            });
        }
    });
}
