import { AppError } from '@ank-ingress/kernel';
import { invalid, parsePartHeaders } from "./part-headers.js";
const CRLF = Buffer.from('\r\n');
const HEADER_END = Buffer.from('\r\n\r\n');
const STATE_PREAMBLE = 0;
const STATE_AFTER_BOUNDARY = 1;
const STATE_HEADERS = 2;
const STATE_BODY = 3;
const STATE_DONE = 4;
/**
 * Incremental `multipart/form-data` parser (RFC 7578). Delimiters are found with `Buffer.indexOf`;
 * part bytes are emitted as views of the input, and only a partial delimiter at a chunk edge is carried over.
 */
export class MultipartParser {
    delimiter;
    limits;
    events;
    state = STATE_PREAMBLE;
    carry;
    parts = 0;
    constructor(boundary, limits, events) {
        this.delimiter = Buffer.from(`\r\n--${boundary}`, 'latin1');
        this.limits = limits;
        this.events = events;
        // A leading CRLF lets the first boundary match the same delimiter as the others.
        this.carry = CRLF;
    }
    get done() {
        return this.state === STATE_DONE;
    }
    write(chunk) {
        if (this.state === STATE_DONE)
            return; // epilogue
        let buf = this.carry.length === 0 ? chunk : Buffer.concat([this.carry, chunk]);
        this.carry = EMPTY;
        while (buf.length > 0 && this.state !== STATE_DONE) {
            if (this.state === STATE_PREAMBLE || this.state === STATE_BODY) {
                const idx = buf.indexOf(this.delimiter);
                if (idx === -1) {
                    const keep = this.partialDelimiterAt(buf);
                    if (this.state === STATE_BODY && keep > 0)
                        this.events.partData(buf.subarray(0, keep));
                    this.carry = buf.subarray(keep);
                    return;
                }
                if (this.state === STATE_BODY) {
                    if (idx > 0)
                        this.events.partData(buf.subarray(0, idx));
                    this.events.partEnd();
                }
                this.state = STATE_AFTER_BOUNDARY;
                buf = buf.subarray(idx + this.delimiter.length);
            }
            else if (this.state === STATE_AFTER_BOUNDARY) {
                let i = 0;
                while (i < buf.length && (buf[i] === 0x20 || buf[i] === 0x09))
                    i++; // transport padding
                if (buf.length - i < 2) {
                    this.carry = buf.subarray(i);
                    return;
                }
                if (buf[i] === 0x2d && buf[i + 1] === 0x2d) {
                    this.state = STATE_DONE;
                    return;
                }
                if (buf[i] !== 0x0d || buf[i + 1] !== 0x0a)
                    throw invalid('Malformed multipart boundary line');
                if (++this.parts > this.limits.maxParts) {
                    throw new AppError('COMMON-413-PAYLOAD_TOO_LARGE', { message: 'Too many multipart parts' });
                }
                this.state = STATE_HEADERS;
                buf = buf.subarray(i + 2);
            }
            else {
                const end = buf.indexOf(HEADER_END);
                if (end === -1) {
                    if (buf.length > this.limits.maxHeaderBytes)
                        throw invalid('Multipart part headers too large');
                    this.carry = buf;
                    return;
                }
                if (end > this.limits.maxHeaderBytes)
                    throw invalid('Multipart part headers too large');
                this.events.partBegin(parsePartHeaders(buf.toString('utf8', 0, end)));
                this.state = STATE_BODY;
                buf = buf.subarray(end + HEADER_END.length);
            }
        }
    }
    /** Call when the request body ended; fails if the closing boundary never arrived. */
    finish() {
        if (this.state !== STATE_DONE)
            throw invalid('Multipart body ended before the closing boundary');
    }
    /** Length of `buf` that is certainly data: everything before a trailing partial delimiter. */
    partialDelimiterAt(buf) {
        const delim = this.delimiter;
        let from = Math.max(0, buf.length - delim.length + 1);
        for (;;) {
            const cr = buf.indexOf(0x0d, from);
            if (cr === -1)
                return buf.length;
            if (buf.compare(delim, 0, buf.length - cr, cr) === 0)
                return cr;
            from = cr + 1;
        }
    }
}
const EMPTY = Buffer.alloc(0);
