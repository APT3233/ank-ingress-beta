import { createHash } from 'node:crypto';
export function defineScript(name, lua, numKeys) {
    const sha1 = createHash('sha1').update(lua, 'utf8').digest('hex');
    return {
        name,
        sha1,
        numKeys,
        async exec(client, keys, args) {
            if (keys.length !== numKeys) {
                throw new TypeError(`Script ${name} expects ${numKeys} keys, got ${keys.length}`);
            }
            try {
                const res = await client.evalSha(sha1, {
                    keys: [...keys],
                    arguments: [...args],
                });
                return res;
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg.includes('NOSCRIPT')) {
                    await client.scriptLoad(lua);
                    const res = await client.evalSha(sha1, {
                        keys: [...keys],
                        arguments: [...args],
                    });
                    return res;
                }
                throw err;
            }
        },
    };
}
