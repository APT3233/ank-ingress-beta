import type { Schema } from '@ank-ingress/config';
import type { ProcessDefinition, RuntimeHandle, RuntimeHost } from '../../types/lifecycle.types.js';
export declare function nodeHost(lingerMs?: number): RuntimeHost;
export declare function runProcess<S extends Schema>(def: ProcessDefinition<S>): RuntimeHandle;
