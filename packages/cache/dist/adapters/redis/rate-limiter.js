import { defineScript } from "./scripts.js";
const FIXED_WINDOW_SCRIPT = defineScript('ank_rate_limit_fixed', `local current = redis.call("INCR", KEYS[1])
   if current == 1 then
     redis.call("PEXPIRE", KEYS[1], ARGV[1])
   end
   local pttl = redis.call("PTTL", KEYS[1])
   if pttl < 0 then
     redis.call("PEXPIRE", KEYS[1], ARGV[1])
     pttl = tonumber(ARGV[1])
   end
   return { current, pttl }`, 1);
export function createRateLimiter(options) {
    const windowStr = String(options.windowMs);
    return {
        async consume(subject) {
            const key = `${options.prefix}:${subject}`;
            const [countRaw, pttlRaw] = await FIXED_WINDOW_SCRIPT.exec(options.redis, [key], [windowStr]);
            const count = Number(countRaw);
            const pttl = Math.max(1, Number(pttlRaw));
            if (count <= options.limit) {
                return {
                    allowed: true,
                    remaining: options.limit - count,
                    retryAfterMs: 0,
                };
            }
            return {
                allowed: false,
                remaining: 0,
                retryAfterMs: pttl,
            };
        },
    };
}
/** Shared fixed-window counters for route `rateLimit` (pass as `createHttpApp({ rateLimit })`). */
export function createRedisRateLimitStore(options) {
    return {
        async consume(request) {
            const key = `${options.prefix}:${request.bucket}:${request.windowMs}:${request.subject}`;
            const [countRaw, pttlRaw] = await FIXED_WINDOW_SCRIPT.exec(options.redis, [key], [String(request.windowMs)]);
            const count = Number(countRaw);
            if (count <= request.limit) {
                return { allowed: true, remaining: request.limit - count, retryAfterMs: 0 };
            }
            return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, Number(pttlRaw)) };
        },
    };
}
