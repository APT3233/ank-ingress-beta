import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
export function secretFile(env) {
    return {
        env,
        secret: true,
        read: (raw, ctx) => {
            if (raw === undefined || raw === '')
                throw new Error('missing');
            if (raw === 'change-me')
                throw new Error('must not be placeholder change-me');
            let value = raw;
            const filePath = ctx?.filePath;
            return {
                current: () => value,
                async reload() {
                    if (!filePath)
                        return value;
                    const next = (await readFile(filePath, 'utf8')).replace(/\r?\n$/, '');
                    if (next !== '' && next !== 'change-me') {
                        value = next;
                    }
                    return value;
                },
                watch() {
                    if (!filePath)
                        return () => { };
                    const watcher = watch(filePath, { persistent: false }, () => {
                        void readFile(filePath, 'utf8')
                            .then((text) => {
                            const next = text.replace(/\r?\n$/, '');
                            if (next !== '' && next !== 'change-me') {
                                value = next;
                            }
                        })
                            .catch(() => {
                            // Keep last valid secret on transient rotation read failure
                        });
                    });
                    return () => watcher.close();
                },
            };
        },
    };
}
export function optionalSecretFile(env) {
    const inner = secretFile(env);
    return {
        env,
        secret: true,
        read: (raw, ctx) => {
            if (raw === undefined || raw === '')
                return null;
            return inner.read(raw, ctx);
        },
    };
}
