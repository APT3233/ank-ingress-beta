import type { Writable } from 'node:stream';
import pino from 'pino';
import type { LogLevel, Logger } from '../../types/logger.types.js';
export interface LoggerOptions {
    readonly service: string;
    readonly instanceId?: string;
    readonly level?: LogLevel;
    readonly destination?: Writable | pino.DestinationStream;
    readonly redactPaths?: readonly string[];
    readonly flushIntervalMs?: number;
}
export declare function createLogger(options: LoggerOptions): Logger;
