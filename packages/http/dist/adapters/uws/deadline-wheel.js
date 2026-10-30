export class DeadlineWheel {
    lanes = new Map();
    timer;
    _activeCount = 0;
    closed = false;
    constructor(tickMs = 25) {
        const interval = Math.max(5, tickMs);
        this.timer = setInterval(() => {
            this.sweep(Date.now());
        }, interval);
        this.timer.unref();
    }
    get activeCount() {
        return this._activeCount;
    }
    getLane(timeoutMs) {
        let lane = this.lanes.get(timeoutMs);
        if (!lane) {
            lane = { head: null, tail: null, count: 0 };
            this.lanes.set(timeoutMs, lane);
        }
        return lane;
    }
    scheduleLane(ctx, lane, onExpire) {
        if (this.closed)
            return;
        if (ctx.deadlineLane !== null) {
            this.unlink(ctx);
        }
        ctx.deadlineWheel = this;
        ctx.deadlineLane = lane;
        ctx.onDeadlineExpire = onExpire;
        ctx.deadlinePrev = lane.tail;
        ctx.deadlineNext = null;
        if (lane.tail !== null) {
            lane.tail.deadlineNext = ctx;
        }
        else {
            lane.head = ctx;
        }
        lane.tail = ctx;
        lane.count += 1;
        this._activeCount += 1;
    }
    schedule(ctx, timeoutMs, onExpire) {
        if (this.closed)
            return;
        this.scheduleLane(ctx, this.getLane(timeoutMs), onExpire);
    }
    unlink(ctx) {
        const lane = ctx.deadlineLane;
        if (lane === null)
            return;
        const prev = ctx.deadlinePrev;
        const next = ctx.deadlineNext;
        if (prev !== null) {
            prev.deadlineNext = next;
        }
        else {
            lane.head = next;
        }
        if (next !== null) {
            next.deadlinePrev = prev;
        }
        else {
            lane.tail = prev;
        }
        ctx.deadlinePrev = null;
        ctx.deadlineNext = null;
        ctx.deadlineLane = null;
        ctx.deadlineWheel = null;
        ctx.onDeadlineExpire = null;
        lane.count -= 1;
        this._activeCount -= 1;
    }
    sweep(now = Date.now()) {
        if (this._activeCount === 0)
            return;
        for (const lane of this.lanes.values()) {
            while (lane.head !== null && lane.head.deadlineAt <= now) {
                const ctx = lane.head;
                const onExpire = ctx.onDeadlineExpire;
                this.unlink(ctx);
                if (onExpire) {
                    onExpire(ctx);
                }
            }
        }
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        clearInterval(this.timer);
        for (const lane of this.lanes.values()) {
            let cur = lane.head;
            while (cur !== null) {
                const next = cur.deadlineNext;
                cur.deadlinePrev = null;
                cur.deadlineNext = null;
                cur.deadlineLane = null;
                cur.deadlineWheel = null;
                cur.onDeadlineExpire = null;
                cur = next;
            }
            lane.head = null;
            lane.tail = null;
            lane.count = 0;
        }
        this.lanes.clear();
        this._activeCount = 0;
    }
}
