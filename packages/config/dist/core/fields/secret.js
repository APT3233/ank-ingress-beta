export function secret(env) {
    return {
        env,
        secret: true,
        read: (raw) => {
            if (raw === undefined || raw === '')
                throw new Error('missing');
            if (raw === 'change-me')
                throw new Error('must not be placeholder change-me');
            return raw;
        },
    };
}
