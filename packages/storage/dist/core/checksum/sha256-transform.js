import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
export function sha256Transform() {
    const hash = createHash('sha256');
    let hexDigest;
    const transform = new Transform({
        transform(chunk, _encoding, callback) {
            hash.update(chunk);
            callback(null, chunk);
        },
        flush(callback) {
            hexDigest = hash.digest('hex');
            callback();
        },
    });
    transform.digest = () => {
        if (hexDigest === undefined) {
            hexDigest = hash.digest('hex');
        }
        return hexDigest;
    };
    return transform;
}
