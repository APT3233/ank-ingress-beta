import type { ConsumerOperations, ConsumerOperationsOptions } from '../../types/consumer-runner.types.js';
export declare function createConsumerOperations<Tx = unknown>(options: ConsumerOperationsOptions<Tx>): ConsumerOperations;
