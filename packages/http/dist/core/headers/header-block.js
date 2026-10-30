/** `\r\nname: value` for every pair in a flat `[name, value, ...]` list. */
export function headerLines(flat, from = 0) {
    let out = '';
    for (let i = from; i < flat.length; i += 2)
        out += `\r\n${flat[i]}: ${flat[i + 1]}`;
    return out;
}
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
export function isHeaderName(name) {
    return HEADER_NAME.test(name);
}
export function toHeaderBlock(flat) {
    if (flat.length === 0)
        return null;
    return { name: flat[0], value: flat[1] + headerLines(flat, 2) };
}
