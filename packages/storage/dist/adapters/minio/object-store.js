import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Client as MinioClient } from 'minio';
import { AppError } from '@ank-ingress/kernel';
import { DEFAULT_MULTIPART_PART_SIZE_BYTES } from "../../types/object-store.types.js";
function toObjectStat(stat) {
    const metaData = stat.metaData ?? {};
    const contentType = metaData['content-type'] ??
        metaData['Content-Type'] ??
        'application/octet-stream';
    return {
        size: stat.size,
        etag: stat.etag,
        lastModified: stat.lastModified,
        contentType,
        metaData,
    };
}
export async function createObjectStore(config) {
    const url = new URL(config.endpoint);
    const useSSL = url.protocol === 'https:';
    const port = url.port ? Number(url.port) : useSSL ? 443 : 80;
    const partSize = config.partSize ?? DEFAULT_MULTIPART_PART_SIZE_BYTES;
    const clientConfig = {
        endPoint: url.hostname,
        port,
        useSSL,
        accessKey: typeof config.accessKey === 'string' ? config.accessKey : config.accessKey.current(),
        secretKey: typeof config.secretKey === 'string' ? config.secretKey : config.secretKey.current(),
        region: config.region ?? 'us-east-1',
        partSize,
    };
    const client = new MinioClient(clientConfig);
    if (config.ensureBucketOnBoot !== false) {
        const exists = await client.bucketExists(config.bucket);
        if (!exists) {
            await client.makeBucket(config.bucket, config.region ?? 'us-east-1');
        }
    }
    const resource = {
        name: config.name ?? 'minio',
        required: config.required ?? true,
        async check() {
            const exists = await client.bucketExists(config.bucket);
            if (!exists) {
                throw new Error(`Bucket ${config.bucket} does not exist`);
            }
        },
        async close() {
            // MinioClient uses stateless HTTP requests
        },
    };
    return {
        bucket: config.bucket,
        partSize,
        async presignPut(key, ttlSec, _contentType) {
            return client.presignedPutObject(config.bucket, key, ttlSec);
        },
        async presignGet(key, ttlSec) {
            return client.presignedGetObject(config.bucket, key, ttlSec);
        },
        async putStream(key, body, size, meta, options) {
            if (options?.signal?.aborted) {
                const abortErr = options.signal.reason instanceof Error
                    ? options.signal.reason
                    : new Error('Object upload aborted');
                // No pipeline owns source errors yet; observe destruction before emitting abort.
                body.once('error', () => { });
                body.destroy(abortErr);
                throw abortErr;
            }
            const relay = new PassThrough({ highWaterMark: 64 * 1024 });
            const pipedDestinations = new Set();
            const origPipe = relay.pipe.bind(relay);
            relay.pipe = ((dest, pipeOpts) => {
                pipedDestinations.add(dest);
                return origPipe(dest, pipeOpts);
            });
            // MinIO SDK's uploadStream uses `body.pipe(chunkier).on('error', reject)` which does not
            // forward source stream errors to `chunkier`. Forward errors explicitly to all piped destinations.
            relay.on('error', (err) => {
                for (const dest of pipedDestinations) {
                    if ('destroy' in dest && typeof dest.destroy === 'function') {
                        dest.destroy(err);
                    }
                }
            });
            const pipePromise = options?.signal
                ? pipeline(body, relay, { signal: options.signal })
                : pipeline(body, relay);
            pipePromise.catch(() => { });
            const putPromise = client.putObject(config.bucket, key, relay, size, meta ? { ...meta } : undefined);
            putPromise.catch((err) => {
                const error = err instanceof Error ? err : new Error(String(err));
                relay.destroy(error);
                body.destroy(error);
            });
            try {
                const [info] = await Promise.all([putPromise, pipePromise]);
                return { etag: info.etag };
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                relay.destroy(error);
                body.destroy(error);
                try {
                    // Give reconciliation its own sockets so the budget can cancel its requests.
                    const cleanupAgent = useSSL ? new HttpsAgent() : new HttpAgent();
                    const cleanupClient = new MinioClient({ ...clientConfig, transportAgent: cleanupAgent });
                    const rawClient = cleanupClient;
                    // Cleanup must never extend an aborted job indefinitely. Own late rejections too.
                    let timer;
                    let cleanupClosed = false;
                    const cleanup = (async () => {
                        const uploadId = await rawClient.findUploadId?.(config.bucket, key);
                        if (uploadId && !cleanupClosed)
                            await rawClient.abortMultipartUpload?.(config.bucket, key, uploadId);
                    })();
                    try {
                        await Promise.race([
                            cleanup,
                            new Promise((resolve) => { timer = setTimeout(resolve, 250); }),
                        ]);
                    }
                    finally {
                        cleanupClosed = true;
                        clearTimeout(timer);
                        cleanupAgent.destroy();
                    }
                }
                catch {
                    // Ignore best-effort multipart cleanup errors
                }
                throw error;
            }
        },
        async getStream(key, options) {
            if (options?.signal?.aborted) {
                throw options.signal.reason instanceof Error
                    ? options.signal.reason
                    : new Error('Object download aborted');
            }
            let rawStat;
            try {
                rawStat = await client.statObject(config.bucket, key);
            }
            catch (err) {
                const code = err?.code;
                if (code === 'NotFound' || code === 'NoSuchKey') {
                    throw new AppError('COMMON-404-NOT_FOUND', { message: `Object not found: ${key}` });
                }
                throw err;
            }
            const rawBody = await client.getObject(config.bucket, key);
            const out = new PassThrough({ highWaterMark: 64 * 1024 });
            const dlPipe = options?.signal
                ? pipeline(rawBody, out, { signal: options.signal })
                : pipeline(rawBody, out);
            dlPipe.catch((err) => {
                const error = err instanceof Error ? err : new Error(String(err));
                rawBody.destroy(error);
                out.destroy(error);
            });
            return {
                stat: toObjectStat(rawStat),
                body: out,
            };
        },
        async remove(key) {
            await client.removeObject(config.bucket, key);
        },
        resource,
    };
}
