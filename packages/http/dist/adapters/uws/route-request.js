export class RouteRequest {
    method;
    path;
    params;
    query;
    body;
    headers;
    identity;
    correlationId;
    idempotencyKey;
    deadlineAt;
    _ctx;
    _execSignal;
    _multipart;
    constructor(ctx, params, query, body, identity, execSignal, execDeadlineAt, multipart = null) {
        this._ctx = ctx;
        this._multipart = multipart;
        this.method = ctx.method;
        this.path = ctx.path;
        this.params = params;
        this.query = query;
        this.body = body;
        this.headers = ctx.headers;
        this.identity = identity;
        this.correlationId = ctx.correlationId;
        this.idempotencyKey = ctx.idempotencyKey;
        this.deadlineAt = execDeadlineAt ?? ctx.deadlineAt;
        this._execSignal = execSignal;
    }
    get signal() {
        return this._execSignal ?? this._ctx.signal;
    }
    parts() {
        if (this._multipart === null)
            throw new TypeError('req.parts() needs a route with bodyFormat: "multipart"');
        return this._multipart.parts();
    }
    get traceparent() {
        return this._ctx.traceparent;
    }
    get ip() {
        return this._ctx.ip;
    }
    get cookies() {
        return this._ctx.cookies;
    }
    get protocol() {
        return this._ctx.protocol;
    }
    get secure() {
        return this._ctx.secure;
    }
    get hostname() {
        return this._ctx.hostname;
    }
}
export class RouteScope {
    tx;
    access;
    deadlineAt;
    _ctx;
    _execSignal;
    constructor(ctx, tx, access, execSignal, execDeadlineAt) {
        this._ctx = ctx;
        this.tx = tx;
        this.access = access;
        this._execSignal = execSignal;
        this.deadlineAt = execDeadlineAt ?? ctx.deadlineAt;
    }
    get signal() {
        return this._execSignal ?? this._ctx.signal;
    }
}
export class RequestLogScope {
    operation;
    _ctx;
    constructor(ctx, operation) {
        this._ctx = ctx;
        this.operation = operation;
    }
    get correlationId() {
        return this._ctx.correlationId;
    }
    get traceId() {
        return this._ctx.traceId;
    }
    get spanId() {
        return this._ctx.spanId;
    }
    get traceparent() {
        return this._ctx.traceparent ?? '';
    }
}
