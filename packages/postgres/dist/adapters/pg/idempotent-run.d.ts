import { Reply } from '@ank-ingress/contracts';
import type { RequestScopeOptions, RunRequestScopeParams } from './request-scope-options.js';
import type { Tx } from './pool.js';
export declare function runIdempotentWrite<Access>(options: RequestScopeOptions<Access>, params: RunRequestScopeParams, handler: (tx: Tx, access: Access, execSignal: AbortSignal, execDeadlineAt: number) => Promise<Reply>, defaultGraceMs: number): Promise<Reply>;
