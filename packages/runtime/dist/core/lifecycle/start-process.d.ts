import { type Schema } from '@ank-ingress/config';
import type { ProcessDefinition, RuntimeHandle, RuntimeHost } from '../../types/lifecycle.types.js';
export declare function startProcess<S extends Schema>(def: ProcessDefinition<S>, host: RuntimeHost): RuntimeHandle;
