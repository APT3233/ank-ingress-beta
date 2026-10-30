import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ConfigError } from "../../core/config-error.js";
export function loadConfig(schema, options = {}) {
    const env = options.env ?? process.env;
    const readFile = options.readFile ?? ((p) => readFileSync(p, 'utf8'));
    const problems = [];
    const values = {};
    const redacted = {};
    const hashed = [];
    for (const [key, field] of Object.entries(schema)) {
        let raw = env[field.env];
        const file = env[`${field.env}_FILE`];
        let filePath;
        if (field.secret && file !== undefined && file !== '') {
            if (raw !== undefined && raw !== '') {
                problems.push(`${field.env}: cannot set both ${field.env} and ${field.env}_FILE`);
                continue;
            }
            try {
                raw = readFile(file).replace(/\r?\n$/, '');
                filePath = file;
            }
            catch {
                problems.push(`${field.env}_FILE: failed to read file`);
                continue;
            }
        }
        try {
            const value = field.read(raw, filePath ? { filePath } : undefined);
            values[key] = value;
            if (field.secret) {
                redacted[field.env] = '[REDACTED]';
            }
            else {
                redacted[field.env] = Array.isArray(value) ? value.join(',') : String(value);
                hashed.push([field.env, value]);
            }
        }
        catch (e) {
            problems.push(`${field.env}: ${e instanceof Error ? e.message : 'invalid'}`);
        }
    }
    if (problems.length > 0)
        throw new ConfigError(problems);
    hashed.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const hash = createHash('sha256').update(JSON.stringify(hashed)).digest('hex');
    return {
        values: Object.freeze(values),
        redacted: Object.freeze(redacted),
        hash,
    };
}
