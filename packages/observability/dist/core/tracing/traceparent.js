import { randomBytes } from 'node:crypto';
const TRACEPARENT_RE = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ALL_ZERO_32 = '00000000000000000000000000000000';
const ALL_ZERO_16 = '0000000000000000';
const POOL_BYTES = 8192;
let randomPool = randomBytes(POOL_BYTES);
let poolOffset = 0;
const HEX_TABLE = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
export function randomHex16() {
    for (;;) {
        if (poolOffset + 8 > POOL_BYTES) {
            randomPool = randomBytes(POOL_BYTES);
            poolOffset = 0;
        }
        const o = poolOffset;
        poolOffset += 8;
        const hex = HEX_TABLE[randomPool[o]] +
            HEX_TABLE[randomPool[o + 1]] +
            HEX_TABLE[randomPool[o + 2]] +
            HEX_TABLE[randomPool[o + 3]] +
            HEX_TABLE[randomPool[o + 4]] +
            HEX_TABLE[randomPool[o + 5]] +
            HEX_TABLE[randomPool[o + 6]] +
            HEX_TABLE[randomPool[o + 7]];
        if (hex !== ALL_ZERO_16) {
            return hex;
        }
    }
}
export function randomHex32() {
    for (;;) {
        const hex = randomHex16() + randomHex16();
        if (hex !== ALL_ZERO_32) {
            return hex;
        }
    }
}
export function parseTraceparent(header) {
    if (!header)
        return null;
    const match = TRACEPARENT_RE.exec(header.trim().toLowerCase());
    if (!match)
        return null;
    const [, version, traceId, parentId, flags] = match;
    if (version !== '00')
        return null;
    if (traceId === ALL_ZERO_32 || parentId === ALL_ZERO_16)
        return null;
    const flagsNum = Number.parseInt(flags, 16);
    return {
        version: '00',
        traceId: traceId,
        parentId: parentId,
        flags: flags,
        sampled: (flagsNum & 0x01) === 0x01,
    };
}
export function formatTraceparent(ctx) {
    const flags = ctx.flags ?? (ctx.sampled === false ? '00' : '01');
    return `00-${ctx.traceId}-${ctx.parentId}-${flags}`;
}
export function childSpan(parent) {
    const traceId = parent?.traceId ?? randomHex32();
    const parentId = randomHex16();
    const flags = parent?.flags ?? '01';
    const sampled = parent?.sampled ?? true;
    return {
        version: '00',
        traceId,
        parentId,
        flags,
        sampled,
    };
}
