import type { FileReplyOptions, StreamReply } from '../../types/http/reply.types.js';
/** Streams a regular file; missing files and directories become 404, paths escaping `root` 403. */
export declare function createFileReply(path: string, options?: FileReplyOptions): Promise<StreamReply>;
