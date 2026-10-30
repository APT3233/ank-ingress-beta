import { chmodSync, lstatSync, unlinkSync } from 'node:fs';
import { connect } from 'node:net';
import { StartupError } from '@ank-ingress/runtime';
export function captureSocketIdentity(socketPath) {
    const identity = lstatSync(socketPath);
    if (!identity.isSocket()) {
        throw new StartupError(`Unix socket path "${socketPath}" is occupied by a non-socket file`);
    }
    return identity;
}
export async function ensureUnixSocketAvailable(socketPath) {
    let original;
    try {
        original = lstatSync(socketPath);
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return;
        throw err;
    }
    if (!original.isSocket()) {
        throw new StartupError(`Unix socket path "${socketPath}" is occupied by a non-socket file`);
    }
    const inUse = await new Promise((resolve, reject) => {
        const socket = connect({ path: socketPath });
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', (err) => {
            socket.destroy();
            if (err.code === 'ECONNREFUSED' || err.code === 'ENOENT')
                resolve(false);
            else
                reject(err);
        });
    });
    if (inUse) {
        throw new StartupError(`Unix socket "${socketPath}" is already in use by another process`);
    }
    removeSocketFile(socketPath, original);
}
export function applySocketPermissions(socketPath, mode) {
    if (mode === undefined)
        return;
    try {
        chmodSync(socketPath, mode);
    }
    catch {
        // Ignore chmod if unsupported on filesystem
    }
}
export function removeSocketFile(socketPath, identity) {
    try {
        const current = lstatSync(socketPath);
        if (!current.isSocket())
            return;
        if (identity && (identity.dev !== current.dev || identity.ino !== current.ino))
            return;
        unlinkSync(socketPath);
    }
    catch {
        // Ignore if already unlinked or no longer owned
    }
}
