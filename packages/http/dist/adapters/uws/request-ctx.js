import { childSpan, formatTraceparent, parseTraceparent } from '@ank-ingress/observability';
import { isTrustedPeer, resolveClientIp } from "./client-ip.js";
import { parseCookieHeader } from "./cookies.js";
import { EMPTY_HEADER_MAP, EMPTY_STRING_MAP, STATE_ABORTED, STATE_OPEN } from "./request-state.js";
const CLIENT_ABORT_ERROR = new Error('Client aborted HTTP request');
const NO_TRUSTED_PROXIES = new Set();
function readRemoteAddress(res) {
    if (typeof res.getRemoteAddressAsText !== 'function')
        return '';
    const ab = res.getRemoteAddressAsText();
    return ab && ab.byteLength > 0 ? Buffer.from(ab).toString('utf8') : '';
}
function firstListValue(value) {
    const comma = value.indexOf(',');
    return (comma === -1 ? value : value.slice(0, comma)).trim();
}
export class RequestCtx {
    state = STATE_OPEN;
    res;
    method;
    path;
    operation;
    deadlineAt;
    startTime;
    url;
    bodyComplete = true;
    workDone = false;
    queryRaw = '';
    params = EMPTY_STRING_MAP;
    query = EMPTY_STRING_MAP;
    headers = EMPTY_HEADER_MAP;
    /** Always set: used by logs, error bodies, and stores. */
    correlationId = '';
    /** Written as the `x-correlation-id` response header; empty when the app disables it. */
    correlationHeader = '';
    rawTraceparent = undefined;
    idempotencyKey = null;
    /** Set only when proxies or the Unix socket are trusted. */
    ipTrust = null;
    /** Set when this response gets security headers or an allowed-origin CORS decoration. */
    decor = null;
    /** `Access-Control-Allow-Origin` value for an allowed request origin. */
    corsOrigin = null;
    // Intrusive O(1) DeadlineWheel pointers
    deadlineWheel = null;
    deadlineLane = null;
    deadlinePrev = null;
    deadlineNext = null;
    onDeadlineExpire = null;
    _span = null;
    _traceparent = null;
    cancelled = false;
    clientAborted = false;
    abortedAttached = false;
    cancelReason = null;
    abortCtrl = null;
    abortCallbacks = null;
    _remoteAddress = undefined;
    _ip = undefined;
    _cookies = null;
    constructor(res, method, path, deadlineAt, captureRemoteAddress = true, startTime = 0, operation = `${method} ${path}`, attachAborted = true) {
        this.res = res;
        this.method = method;
        this.path = path;
        this.operation = operation;
        this.url = path;
        this.deadlineAt = deadlineAt;
        this.startTime = startTime;
        if (captureRemoteAddress) {
            this._remoteAddress = readRemoteAddress(res);
        }
        if (attachAborted) {
            this.attachOnAborted();
        }
    }
    attachOnAborted() {
        if (this.abortedAttached)
            return;
        this.abortedAttached = true;
        this.res.onAborted(() => {
            this.clientAborted = true;
            this.fireAbort(CLIENT_ABORT_ERROR, true);
        });
    }
    get _ctx() {
        return this;
    }
    /** Peer address; read lazily from the socket while the response is still open, otherwise ''. */
    get remoteAddress() {
        if (this._remoteAddress === undefined) {
            this._remoteAddress = this.state === STATE_OPEN ? readRemoteAddress(this.res) : '';
        }
        return this._remoteAddress;
    }
    get ip() {
        if (this._ip === undefined) {
            const trust = this.ipTrust;
            this._ip = resolveClientIp(this.remoteAddress, this.headers['x-forwarded-for'], trust?.trustedProxies ?? NO_TRUSTED_PROXIES, trust?.trustUnixSocket ?? false);
        }
        return this._ip;
    }
    forwardedTrusted() {
        const trust = this.ipTrust;
        return trust !== null && isTrustedPeer(this.remoteAddress, trust.trustedProxies, trust.trustUnixSocket);
    }
    get protocol() {
        const proto = this.headers['x-forwarded-proto'];
        if (proto === undefined || !this.forwardedTrusted())
            return 'http';
        return firstListValue(proto).toLowerCase() === 'https' ? 'https' : 'http';
    }
    get secure() {
        return this.protocol === 'https';
    }
    get hostname() {
        const forwarded = this.headers['x-forwarded-host'];
        const host = forwarded !== undefined && this.forwardedTrusted() ? firstListValue(forwarded) : this.headers.host;
        if (!host)
            return null;
        if (host.charCodeAt(0) === 91 /* [ */) {
            const end = host.indexOf(']');
            return end === -1 ? host : host.slice(0, end + 1);
        }
        const colon = host.indexOf(':');
        return colon === -1 ? host : host.slice(0, colon);
    }
    /** Only routes with `bodyFormat: 'multipart'` stream parts; those never take this fast path. */
    parts() {
        throw new TypeError('req.parts() needs a route with bodyFormat: "multipart"');
    }
    get cookies() {
        if (this._cookies === null) {
            this._cookies = parseCookieHeader(this.headers.cookie);
        }
        return this._cookies;
    }
    get body() {
        return undefined;
    }
    get identity() {
        return null;
    }
    get tx() {
        return null;
    }
    get access() {
        return null;
    }
    hasSignalAllocated() {
        return this.abortCtrl !== null;
    }
    hasTraceGenerated() {
        return this._span !== null;
    }
    get span() {
        if (this._span === null) {
            const parsed = parseTraceparent(this.rawTraceparent ?? this.headers.traceparent);
            this._span = childSpan(parsed);
        }
        return this._span;
    }
    get traceId() {
        return this.span.traceId;
    }
    get spanId() {
        return this.span.parentId;
    }
    get traceparent() {
        if (this._traceparent === null) {
            this._traceparent = formatTraceparent(this.span);
        }
        return this._traceparent;
    }
    set traceparent(value) {
        this._traceparent = value;
    }
    unlinkDeadline() {
        if (this.deadlineWheel !== null) {
            this.deadlineWheel.unlink(this);
        }
    }
    get socketAborted() {
        return this.clientAborted;
    }
    get aborted() {
        return this.state === STATE_ABORTED || this.cancelled;
    }
    get writable() {
        return this.state === STATE_OPEN;
    }
    get signal() {
        if (!this.abortCtrl) {
            this.abortCtrl = new AbortController();
            if (this.cancelled || this.state === STATE_ABORTED) {
                this.abortCtrl.abort(this.cancelReason ?? new Error('HTTP request aborted'));
            }
        }
        return this.abortCtrl.signal;
    }
    fireAbort(reason, isClientAbort = false) {
        this.unlinkDeadline();
        if (isClientAbort) {
            this.clientAborted = true;
        }
        if (isClientAbort || this.state === STATE_OPEN) {
            this.state = STATE_ABORTED;
        }
        if (this.cancelled) {
            return;
        }
        this.cancelled = true;
        this.cancelReason = reason;
        if (this.abortCtrl && !this.abortCtrl.signal.aborted) {
            this.abortCtrl.abort(reason);
        }
        const cbs = this.abortCallbacks;
        this.abortCallbacks = null;
        if (cbs) {
            for (let i = 0; i < cbs.length; i++) {
                cbs[i]();
            }
        }
    }
    abortDeadline() {
        this.fireAbort(new Error('Request deadline exceeded'), false);
    }
    abortShutdown() {
        this.fireAbort(new Error('Server shutting down'), false);
    }
    onAbort(cb) {
        if (this.cancelled || this.state === STATE_ABORTED) {
            cb();
            return;
        }
        if (!this.abortCallbacks) {
            this.abortCallbacks = [cb];
        }
        else {
            this.abortCallbacks.push(cb);
        }
    }
}
