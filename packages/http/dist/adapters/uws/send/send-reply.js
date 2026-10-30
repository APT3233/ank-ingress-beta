import { sendEmpty, sendText } from "./send-basic.js";
import { sendJson } from "./send-json.js";
import { sendStream } from "./send-stream.js";
export function sendReply(res, ctx, reply, isHead = false, closeConnection = false, logger, serializer) {
    if (reply.kind === 'json') {
        return sendJson(res, ctx, reply.status ?? 200, reply.data, reply.headers, isHead, closeConnection, logger, serializer);
    }
    if (reply.kind === 'empty') {
        sendEmpty(res, ctx, reply.status, reply.headers, closeConnection);
        return reply.status;
    }
    if (reply.kind === 'text') {
        return sendText(res, ctx, reply, isHead, closeConnection);
    }
    return sendStream(res, ctx, reply, isHead).then(() => reply.status ?? 200);
}
