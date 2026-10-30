import { STATE_OPEN, STATE_SENT } from "../request-state.js";
import { HEADER_CONTENT_TYPE, HEADER_CORRELATION_ID, assertHeaderValue, assertHeaders, writeDecor, writeHeaders } from "./header-writers.js";
import { statusLine } from "./status-line.js";
export function sendEmpty(res, ctx, status, headers, closeConnection = false) {
    if (ctx.state !== STATE_OPEN)
        return;
    if (headers !== undefined)
        assertHeaders(headers);
    ctx.state = STATE_SENT;
    res.cork(() => {
        res.writeStatus(statusLine(status));
        if (ctx.correlationHeader) {
            res.writeHeader(HEADER_CORRELATION_ID, ctx.correlationHeader);
        }
        writeHeaders(res, headers);
        writeDecor(res, ctx, headers);
        if (status === 204 || status === 304 || headers?.['content-length']) {
            if (closeConnection) {
                res.endWithoutBody(0, true);
            }
            else {
                res.endWithoutBody();
            }
        }
        else {
            res.endWithoutBody(0, closeConnection);
        }
    });
}
export function sendText(res, ctx, reply, isHead = false, closeConnection = false) {
    const status = reply.status ?? 200;
    if (ctx.state !== STATE_OPEN)
        return status;
    assertHeaderValue(reply.contentType);
    if (reply.headers !== undefined)
        assertHeaders(reply.headers);
    ctx.state = STATE_SENT;
    res.cork(() => {
        res.writeStatus(statusLine(status));
        res.writeHeader(HEADER_CONTENT_TYPE, reply.contentType);
        if (ctx.correlationHeader) {
            res.writeHeader(HEADER_CORRELATION_ID, ctx.correlationHeader);
        }
        writeHeaders(res, reply.headers);
        writeDecor(res, ctx, reply.headers);
        if (isHead) {
            res.endWithoutBody(Buffer.byteLength(reply.body), closeConnection);
        }
        else {
            res.end(reply.body, closeConnection);
        }
    });
    return status;
}
