import bcrypt from 'bcryptjs';
import { validationError } from '@ank-ingress/kernel';
export const MIN_BCRYPT_COST = 10;
export const MAX_PASSWORD_BYTES = 72;
// Precomputed valid bcrypt cost-10 dummy hash for constant-time comparison when account does not exist
const DUMMY_HASH_COST_10 = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const taskModuleUrl = new URL('./bcrypt.task.js', import.meta.url).href;
export const bcryptWorkerTasks = Object.freeze([
    { name: 'security.bcrypt.hash', moduleUrl: taskModuleUrl },
    { name: 'security.bcrypt.compare', moduleUrl: taskModuleUrl },
]);
export class PasswordHasher {
    pool;
    cost;
    constructor(pool, cost = 10) {
        if (!Number.isInteger(cost) || cost < MIN_BCRYPT_COST || cost > 15) {
            throw new TypeError(`BCrypt cost must be an integer in ${MIN_BCRYPT_COST}..15`);
        }
        this.pool = pool;
        this.cost = cost;
    }
    async hash(password, signal) {
        if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
            throw validationError([
                {
                    field: 'password',
                    code: 'COMMON-422-MAX_LENGTH',
                    params: { max_length: MAX_PASSWORD_BYTES },
                },
            ]);
        }
        return this.pool.run('security.bcrypt.hash', { password, cost: this.cost }, signal ? { signal } : undefined);
    }
    async verify(password, hash, signal) {
        const tooLong = Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES;
        const targetHash = hash === null || tooLong ? DUMMY_HASH_COST_10 : hash;
        const matched = await this.pool.run('security.bcrypt.compare', { password: tooLong ? password.slice(0, 72) : password, hash: targetHash }, signal ? { signal } : undefined);
        if (hash === null || tooLong)
            return false;
        return matched;
    }
    needsRehash(hash) {
        return bcrypt.getRounds(hash) < this.cost;
    }
}
