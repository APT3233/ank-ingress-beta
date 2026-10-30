import { createServer } from 'node:http';
const STATE_VALUE = {
    READY: 1,
    DEGRADED: 2,
    STARTING: 0,
    NOT_READY: 0,
    DRAINING: 0,
    STOPPED: 0,
};
function send(res, status, contentType, body) {
    res.writeHead(status, {
        'content-type': contentType,
        'cache-control': 'no-store',
    });
    res.end(body);
}
export async function startHealthServer(options) {
    const readinessGauge = options.metrics
        .gauge('ank_readiness_state', 'Readiness state (1=READY, 2=DEGRADED, 0=NOT_READY)')
        .bind();
    const handle = (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            send(res, 405, 'application/json; charset=utf-8', '{"status":"METHOD_NOT_ALLOWED"}\n');
            return;
        }
        const url = req.url?.split('?')[0];
        const snap = options.status();
        readinessGauge.set(STATE_VALUE[snap.state]);
        if (url === '/healthz') {
            const alive = snap.state !== 'STOPPED';
            send(res, alive ? 200 : 503, 'application/json; charset=utf-8', JSON.stringify({ status: alive ? 'OK' : 'STOPPED' }) + '\n');
            return;
        }
        if (url === '/readyz') {
            const ready = snap.state === 'READY' || snap.state === 'DEGRADED';
            send(res, ready ? 200 : 503, 'application/json; charset=utf-8', JSON.stringify(snap) + '\n');
            return;
        }
        if (url === '/metrics') {
            send(res, 200, 'text/plain; version=0.0.4; charset=utf-8', options.metrics.render());
            return;
        }
        send(res, 404, 'application/json; charset=utf-8', '{"status":"NOT_FOUND"}\n');
    };
    const server = createServer(handle);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, options.host, () => resolve());
    });
    const addr = server.address();
    return {
        host: addr.address || options.host,
        port: addr.port,
        close: () => new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
}
