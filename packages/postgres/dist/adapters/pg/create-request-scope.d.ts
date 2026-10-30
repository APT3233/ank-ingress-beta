import type { RequestScopeOptions, RequestScopeRunner } from './request-scope-options.js';
export declare function createRequestScope<Access>(options: RequestScopeOptions<Access>): RequestScopeRunner<Access>;
