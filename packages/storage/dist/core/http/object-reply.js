import { Reply } from '@ank-ingress/contracts';
export async function objectReply(store, key, headers, options) {
    const { stat, body } = await store.getStream(key, options);
    return Reply.stream(body, {
        contentType: stat.contentType,
        size: stat.size,
        headers: {
            etag: `"${stat.etag}"`,
            ...headers,
        },
    });
}
