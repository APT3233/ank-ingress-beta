export function required(env, parse) {
    return {
        env,
        secret: false,
        read: (raw) => {
            if (raw === undefined || raw === '')
                throw new Error('missing');
            return parse(raw);
        },
    };
}
export function optional(env, parse, fallback) {
    return {
        env,
        secret: false,
        read: (raw) => (raw === undefined || raw === '' ? fallback : parse(raw)),
    };
}
export const text = (raw) => raw;
export function integer(min, max) {
    return (raw) => {
        if (!/^-?\d+$/.test(raw))
            throw new Error('not an integer');
        const n = Number(raw);
        if (n < min || n > max)
            throw new Error(`out of range ${min}..${max}`);
        return n;
    };
}
export const port = integer(1, 65535);
export const boolean = (raw) => {
    if (raw === 'on' || raw === 'true' || raw === '1')
        return true;
    if (raw === 'off' || raw === 'false' || raw === '0')
        return false;
    throw new Error('expected true/false or on/off');
};
export function oneOf(values) {
    return (raw) => {
        if (!values.includes(raw)) {
            throw new Error(`expected one of ${values.join(', ')}`);
        }
        return raw;
    };
}
export const absolutePath = (raw) => {
    if (!raw.startsWith('/'))
        throw new Error('expected absolute path');
    return raw;
};
export function list(item) {
    return (raw) => raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '')
        .map(item);
}
