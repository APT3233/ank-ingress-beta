import { STATE_OPEN, STATE_SENT } from "../request-state.js";
import { HEADER_CONTENT_TYPE, HEADER_CORRELATION_ID, assertHeaders, writeDecor, writeHeaders } from "./header-writers.js";
import { statusLine } from "./status-line.js";
const CONTENT_TYPE_JSON = 'application/json; charset=utf-8';
/**
 * Content type plus the start of the correlation-id line, so both headers cost one native `writeHeader`
 * (uWS writes `name: value\r\n` verbatim). Safe because correlation ids are validated on intake.
 */
const CONTENT_TYPE_JSON_THEN_CORRELATION = `${CONTENT_TYPE_JSON}\r\n${HEADER_CORRELATION_ID}: `;
let corkRes = null;
let corkStatusLine = '200 OK';
let corkCorrelationId = '';
let corkHeaders = undefined;
let corkCtx = null;
let corkIsHead = false;
let corkCloseConn = false;
let corkPayload = '';
function flushCorkJson() {
    const r = corkRes;
    r.writeStatus(corkStatusLine);
    r.writeHeader(HEADER_CONTENT_TYPE, corkCorrelationId === '' ? CONTENT_TYPE_JSON : CONTENT_TYPE_JSON_THEN_CORRELATION + corkCorrelationId);
    writeHeaders(r, corkHeaders);
    if (corkCtx !== null)
        writeDecor(r, corkCtx, corkHeaders);
    if (corkIsHead) {
        r.endWithoutBody(Buffer.byteLength(corkPayload), corkCloseConn);
    }
    else {
        r.end(corkPayload, corkCloseConn);
    }
}
export function sendJson(res, ctx, status, data, headers, isHead = false, closeConnection = false, logger, serializer, 
/** True only in the synchronous top of a uWS route handler, where uWS has already corked the socket. */
corked = false) {
    if (ctx.state !== STATE_OPEN)
        return status;
    let payload;
    let actualStatus = status;
    let actualHeaders = headers;
    try {
        const serialized = serializer && status >= 200 && status < 300 ? serializer(data) : JSON.stringify(data);
        if (serialized === undefined) {
            throw new TypeError('JSON.stringify returned undefined');
        }
        payload = serialized;
    }
    catch (err) {
        logger?.error('http.serialize_failed', {
            method: ctx.method,
            path: ctx.path,
            correlationId: ctx.correlationId,
            error: err instanceof Error ? err.message : String(err),
        });
        actualStatus = 500;
        actualHeaders = undefined;
        const safeCorr = JSON.stringify(ctx.correlationId || '');
        payload = `{"code":"COMMON-500-INTERNAL","message":"Internal server error","correlationId":${safeCorr}}`;
    }
    if (ctx.state !== STATE_OPEN)
        return actualStatus;
    if (actualHeaders !== undefined)
        assertHeaders(actualHeaders);
    ctx.state = STATE_SENT;
    if (actualStatus === 200 && actualHeaders === undefined && ctx.decor === null && !isHead && !closeConnection) {
        // uWS emits "200 OK" implicitly with the first header, so the fast path makes two native calls.
        const contentType = ctx.correlationHeader === '' ? CONTENT_TYPE_JSON : CONTENT_TYPE_JSON_THEN_CORRELATION + ctx.correlationHeader;
        if (corked) {
            res.writeHeader(HEADER_CONTENT_TYPE, contentType).end(payload);
        }
        else {
            res.cork(() => {
                res.writeHeader(HEADER_CONTENT_TYPE, contentType).end(payload);
            });
        }
        return actualStatus;
    }
    corkRes = res;
    corkStatusLine = actualStatus === 200 ? '200 OK' : statusLine(actualStatus);
    corkCorrelationId = ctx.correlationHeader;
    corkHeaders = actualHeaders;
    corkCtx = ctx.decor === null ? null : ctx;
    corkIsHead = isHead;
    corkCloseConn = closeConnection;
    corkPayload = payload;
    if (corked)
        flushCorkJson();
    else
        res.cork(flushCorkJson);
    corkRes = null;
    corkCtx = null;
    return actualStatus;
}
