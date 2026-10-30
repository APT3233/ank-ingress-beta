import { type Inbound } from '@ank-ingress/runtime';
import type { ConsumerRunnerOptions } from '../../types/consumer-runner.types.js';
export declare function createConsumerRunner<Tx = unknown>(options: ConsumerRunnerOptions<Tx>): Inbound;
