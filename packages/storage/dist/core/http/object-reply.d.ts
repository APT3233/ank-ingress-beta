import { type StreamReply } from '@ank-ingress/contracts';
import type { ObjectStore, ObjectStreamOptions } from '../../types/object-store.types.js';
export declare function objectReply(store: ObjectStore, key: string, headers?: Readonly<Record<string, string>>, options?: ObjectStreamOptions): Promise<StreamReply>;
