import type { Readable } from 'node:stream';
import type { SecretHolder } from '@ank-ingress/config';
import type { Resource } from '@ank-ingress/runtime';
export declare const DEFAULT_MULTIPART_PART_SIZE_BYTES: number;
export interface ObjectStoreConfig {
    readonly endpoint: string;
    readonly accessKey: string | SecretHolder;
    readonly secretKey: string | SecretHolder;
    readonly bucket: string;
    readonly region?: string;
    readonly name?: string;
    readonly required?: boolean;
    readonly ensureBucketOnBoot?: boolean;
    readonly partSize?: number;
}
export interface ObjectStat {
    readonly size: number;
    readonly etag: string;
    readonly lastModified: Date;
    readonly contentType: string;
    readonly metaData: Readonly<Record<string, string>>;
}
export interface ObjectStreamOptions {
    readonly signal?: AbortSignal;
}
export interface ObjectStore {
    readonly bucket: string;
    readonly partSize?: number;
    presignPut(key: string, ttlSec: number, contentType?: string): Promise<string>;
    presignGet(key: string, ttlSec: number): Promise<string>;
    putStream(key: string, body: Readable, size?: number, meta?: Readonly<Record<string, string>>, options?: ObjectStreamOptions): Promise<{
        etag: string;
    }>;
    getStream(key: string, options?: ObjectStreamOptions): Promise<{
        stat: ObjectStat;
        body: Readable;
    }>;
    remove(key: string): Promise<void>;
    readonly resource: Resource;
}
