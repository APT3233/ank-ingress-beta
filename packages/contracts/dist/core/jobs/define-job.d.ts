import type { TSchema } from '@sinclair/typebox';
import type { JobSpec } from '../../types/job-spec.types.js';
export declare function defineJob<P extends TSchema, R = unknown>(spec: JobSpec<P, R>): JobSpec<P, R>;
