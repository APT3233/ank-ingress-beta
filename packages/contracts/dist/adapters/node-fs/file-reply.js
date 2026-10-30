import { open } from 'node:fs/promises';
import { basename, extname, isAbsolute, resolve, sep } from 'node:path';
import { AppError } from '@ank-ingress/kernel';
import { contentDisposition, stream } from "../../core/http/reply-builders.js";
const CONTENT_TYPES = {
    '.csv': 'text/csv; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.htm': 'text/html; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xml': 'application/xml; charset=utf-8',
    '.zip': 'application/zip',
};
/** Streams a regular file; missing files and directories become 404, paths escaping `root` 403. */
export async function createFileReply(path, options = {}) {
    let fullPath;
    if (options.root !== undefined) {
        const root = resolve(options.root);
        fullPath = resolve(root, path);
        if (path.includes('\0') || (fullPath !== root && !fullPath.startsWith(root + sep))) {
            throw new AppError('COMMON-403-FORBIDDEN', { message: 'File path escapes the configured root' });
        }
    }
    else {
        if (!isAbsolute(path)) {
            throw new TypeError('Reply.file requires an absolute path or a root option');
        }
        fullPath = path;
    }
    let handle;
    try {
        handle = await open(fullPath, 'r');
    }
    catch (err) {
        const code = err.code;
        if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') {
            throw new AppError('COMMON-404-NOT_FOUND', { message: 'File not found' });
        }
        throw err;
    }
    const stat = await handle.stat().catch(async (err) => {
        await handle.close();
        throw err;
    });
    if (!stat.isFile()) {
        await handle.close();
        throw new AppError('COMMON-404-NOT_FOUND', { message: 'File not found' });
    }
    const { download } = options;
    const headers = download === undefined || download === false
        ? options.headers
        : {
            ...options.headers,
            'content-disposition': contentDisposition(download === true ? basename(fullPath) : download),
        };
    return stream(handle.createReadStream(), {
        contentType: options.contentType ?? CONTENT_TYPES[extname(fullPath).toLowerCase()] ?? 'application/octet-stream',
        size: stat.size,
        ...(options.status === undefined ? {} : { status: options.status }),
        ...(headers === undefined ? {} : { headers }),
    });
}
