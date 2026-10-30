import type { HttpResponse } from 'uWebSockets.js';
import type { BodyFormat } from '@ank-ingress/contracts';
import type { RequestCtx } from './request-ctx.js';
export interface ParsedBody {
    readonly data: unknown;
    readonly rawHash: string;
    readonly rawBuffer: Buffer;
}
export interface BodyCollector {
    readonly isComplete: boolean;
    cancel(): void;
    read(format: BodyFormat, contentType: string | undefined, contentLengthHeader: string | undefined, computeHash: boolean): Promise<ParsedBody>;
    readJson(contentType: string | undefined, contentLengthHeader: string | undefined, computeHash: boolean): Promise<ParsedBody>;
}
export declare function startBodyCollector(res: HttpResponse, ctx: RequestCtx, maxBodyBytes: number): BodyCollector;
export declare function readJsonBody(res: HttpResponse, ctx: RequestCtx, contentType: string | undefined, contentLengthHeader: string | undefined, maxBodyBytes: number, computeHash: boolean): Promise<ParsedBody>;
