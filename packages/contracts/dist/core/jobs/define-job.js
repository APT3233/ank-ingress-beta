import { CompositionError } from '@ank-ingress/kernel';
const JOB_NAME_FORMAT = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/;
export function defineJob(spec) {
    if (!JOB_NAME_FORMAT.test(spec.name)) {
        throw new CompositionError(`Invalid job name "${spec.name}" (expected module.job-name)`);
    }
    return Object.freeze({ ...spec });
}
