import { type OutboxPublisherState } from './publisher-io.js';
/** One shard-loop tick: lease, fetch, publish, mark, release, then reschedule itself. */
export declare function tick(state: OutboxPublisherState): Promise<void>;
