import { createHash } from 'node:crypto';
import { AppError } from '@ank-ingress/kernel';
import { STATE_OPEN } from "./request-state.js";
import { sendJson } from "./send/send-json.js";
const MEDIA_TYPES = {
    json: 'application/json',
    urlencoded: 'application/x-www-form-urlencoded',
    text: 'text/plain',
    multipart: 'multipart/form-data',
};
function send413AndClose(res, ctx) {
    sendJson(res, ctx, 413, {
        code: 'COMMON-413-PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size',
        correlationId: ctx.correlationId,
    }, { connection: 'close' }, false, true);
}
export function startBodyCollector(res, ctx, maxBodyBytes) {
    ctx.bodyComplete = false;
    const chunks = [];
    let received = 0;
    let finished = false;
    let exceeded = false;
    let cancelled = false;
    let waiterResolve = null;
    let waiterReject = null;
    const failWaiter = (err) => {
        const rej = waiterReject;
        waiterResolve = null;
        waiterReject = null;
        if (rej)
            rej(err);
    };
    ctx.onAbort(() => {
        if (finished || cancelled)
            return;
        cancelled = true;
        chunks.length = 0;
        failWaiter(new AppError('COMMON-503-UNAVAILABLE', { message: 'Request aborted while reading body' }));
    });
    res.onData((ab, isLast) => {
        if (cancelled || exceeded || finished || ctx.aborted || ctx.state !== STATE_OPEN) {
            return;
        }
        const chunkLen = ab.byteLength;
        if (received + chunkLen > maxBodyBytes) {
            exceeded = true;
            chunks.length = 0;
            if (waiterReject) {
                failWaiter(new AppError('COMMON-413-PAYLOAD_TOO_LARGE', {
                    message: 'Request payload exceeds maximum allowed size',
                }));
            }
            return;
        }
        if (chunkLen > 0) {
            // Copy only the actual chunk bytes received from uWS (never preallocate from Content-Length)
            chunks.push(Buffer.from(Buffer.from(ab)));
            received += chunkLen;
        }
        if (isLast) {
            finished = true;
            ctx.bodyComplete = true;
            const resFn = waiterResolve;
            waiterResolve = null;
            waiterReject = null;
            if (resFn) {
                const full = chunks.length === 0 ? Buffer.alloc(0) : chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, received);
                chunks.length = 0;
                resFn(full);
            }
        }
    });
    return {
        get isComplete() {
            return finished;
        },
        cancel() {
            cancelled = true;
            chunks.length = 0;
        },
        readJson(contentType, contentLengthHeader, computeHash) {
            return this.read('json', contentType, contentLengthHeader, computeHash);
        },
        async read(format, contentType, contentLengthHeader, computeHash) {
            const mediaType = MEDIA_TYPES[format];
            if (!contentType || !contentType.toLowerCase().startsWith(mediaType)) {
                cancelled = true;
                chunks.length = 0;
                throw new AppError('COMMON-415-UNSUPPORTED_MEDIA_TYPE', {
                    message: `Expected Content-Type: ${mediaType}`,
                });
            }
            const declaredLen = contentLengthHeader !== undefined && /^\d+$/.test(contentLengthHeader)
                ? Number(contentLengthHeader)
                : -1;
            if (declaredLen > maxBodyBytes || exceeded) {
                cancelled = true;
                chunks.length = 0;
                throw new AppError('COMMON-413-PAYLOAD_TOO_LARGE', {
                    message: 'Request payload exceeds maximum allowed size',
                });
            }
            if (cancelled || ctx.aborted || ctx.state !== STATE_OPEN) {
                throw new AppError('COMMON-503-UNAVAILABLE', {
                    message: 'Request aborted while reading body',
                });
            }
            const fullBuffer = finished
                ? chunks.length === 0
                    ? Buffer.alloc(0)
                    : chunks.length === 1
                        ? chunks[0]
                        : Buffer.concat(chunks, received)
                : await new Promise((resolve, reject) => {
                    waiterResolve = resolve;
                    waiterReject = reject;
                });
            chunks.length = 0;
            if (ctx.aborted || ctx.state !== STATE_OPEN) {
                throw new AppError('COMMON-503-UNAVAILABLE', {
                    message: 'Request deadline exceeded before body processing',
                });
            }
            let data;
            if (format === 'text') {
                data = fullBuffer.toString('utf8');
            }
            else if (format === 'urlencoded') {
                data = Object.fromEntries(new URLSearchParams(fullBuffer.toString('utf8')));
            }
            else {
                if (fullBuffer.length === 0) {
                    throw new AppError('COMMON-400-INVALID_JSON', { message: 'Empty JSON body' });
                }
                try {
                    const text = fullBuffer.toString('utf8');
                    data = JSON.parse(text);
                }
                catch (err) {
                    throw new AppError('COMMON-400-INVALID_JSON', {
                        message: 'Malformed JSON payload',
                        cause: err,
                    });
                }
            }
            const rawHash = computeHash ? createHash('sha256').update(fullBuffer).digest('hex') : '';
            return { data, rawHash, rawBuffer: fullBuffer };
        },
    };
}
export function readJsonBody(res, ctx, contentType, contentLengthHeader, maxBodyBytes, computeHash) {
    const collector = startBodyCollector(res, ctx, maxBodyBytes);
    return collector.readJson(contentType, contentLengthHeader, computeHash).catch((err) => {
        if (err instanceof AppError && err.httpStatus === 413 && ctx.state === STATE_OPEN) {
            send413AndClose(res, ctx);
        }
        throw err;
    });
}
