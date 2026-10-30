import { randomBytes } from 'node:crypto';
const HEX_BYTE = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
const HEX_16 = Array.from({ length: 65536 }, (_, i) => i.toString(16).padStart(4, '0'));
let uuidPrefix = '';
let uuidSeq = 65536;
function rotateUuidPrefix() {
    const buf = randomBytes(14);
    const b6 = (buf[6] & 0x0f) | 0x40;
    const b8 = (buf[8] & 0x3f) | 0x80;
    uuidPrefix =
        HEX_BYTE[buf[0]] +
            HEX_BYTE[buf[1]] +
            HEX_BYTE[buf[2]] +
            HEX_BYTE[buf[3]] +
            '-' +
            HEX_BYTE[buf[4]] +
            HEX_BYTE[buf[5]] +
            '-' +
            HEX_BYTE[b6] +
            HEX_BYTE[buf[7]] +
            '-' +
            HEX_BYTE[b8] +
            HEX_BYTE[buf[9]] +
            '-' +
            HEX_BYTE[buf[10]] +
            HEX_BYTE[buf[11]] +
            HEX_BYTE[buf[12]] +
            HEX_BYTE[buf[13]];
    uuidSeq = 0;
}
/** Client correlation ids are echoed into a response header, so accept only 1–64 visible ASCII chars. */
export function isSafeCorrelationId(value) {
    const len = value.length;
    if (len === 0 || len > 64)
        return false;
    for (let i = 0; i < len; i++) {
        const c = value.charCodeAt(i);
        if (c < 0x21 || c > 0x7e)
            return false;
    }
    return true;
}
export function nextFastUuid() {
    if (uuidSeq >= 65536) {
        rotateUuidPrefix();
    }
    return uuidPrefix + HEX_16[uuidSeq++];
}
