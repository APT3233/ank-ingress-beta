import { ifNoneMatchHits, weakEtag } from "../../../core/headers/etag.js";
import { sendEmpty, sendText } from "./send-basic.js";
import { sendJson } from "./send-json.js";
function sendNotModified(res, ctx, etag, headers) {
    sendEmpty(res, ctx, 304, { ...headers, etag });
    return 304;
}
/** `sendJson` for `etag: true` routes; chosen per route at compile time so other routes pay nothing. */
export function sendJsonWithEtag(res, ctx, reply, isHead, logger, serializer) {
    const status = reply.status ?? 200;
    let payload;
    if (status === 200) {
        try {
            payload = serializer ? serializer(reply.data) : JSON.stringify(reply.data);
        }
        catch {
            payload = undefined; // sendJson below reports the serialization failure.
        }
    }
    if (payload === undefined) {
        return sendJson(res, ctx, status, reply.data, reply.headers, isHead, false, logger, serializer);
    }
    const etag = weakEtag(payload);
    if (ifNoneMatchHits(ctx.headers['if-none-match'], etag))
        return sendNotModified(res, ctx, etag, reply.headers);
    const serialized = payload;
    return sendJson(res, ctx, 200, reply.data, { ...reply.headers, etag }, isHead, false, logger, () => serialized);
}
export function sendTextWithEtag(res, ctx, reply, isHead) {
    if ((reply.status ?? 200) !== 200)
        return sendText(res, ctx, reply, isHead);
    const etag = weakEtag(reply.body);
    if (ifNoneMatchHits(ctx.headers['if-none-match'], etag))
        return sendNotModified(res, ctx, etag, reply.headers);
    return sendText(res, ctx, { ...reply, headers: { ...reply.headers, etag } }, isHead);
}
