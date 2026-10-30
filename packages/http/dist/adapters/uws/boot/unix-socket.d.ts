import { type Stats } from 'node:fs';
type SocketIdentity = Pick<Stats, 'dev' | 'ino'>;
export declare function captureSocketIdentity(socketPath: string): SocketIdentity;
export declare function ensureUnixSocketAvailable(socketPath: string): Promise<void>;
export declare function applySocketPermissions(socketPath: string, mode: number | undefined): void;
export declare function removeSocketFile(socketPath: string, identity?: SocketIdentity): void;
export {};
