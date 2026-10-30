/** Registers CORS preflight, 405 Method Not Allowed, and the catch-all 404 after every route. */
export function registerRouteFallbacks(app, methodsByPath, cors) {
    // Answer CORS preflight on each known path before the 405 fallback
    if (cors) {
        for (const [path, methods] of methodsByPath) {
            const allowMethods = [...methods].sort().join(', ');
            app.options(path, (res, req) => {
                const origin = req.getHeader('origin');
                res.cork(() => cors.writePreflight(res, origin, allowMethods));
            });
        }
    }
    // Register 405 Method Not Allowed on each known path
    for (const [path, methods] of methodsByPath) {
        const allow = [...methods, ...(cors ? ['OPTIONS'] : [])].sort().join(', ');
        const body405 = JSON.stringify({
            code: 'COMMON-405-METHOD_NOT_ALLOWED',
            message: 'Method not allowed',
        });
        const len405 = String(Buffer.byteLength(body405));
        app.any(path, (res, req) => {
            const isHead = req.getMethod() === 'head';
            res.cork(() => {
                res
                    .writeStatus('405 Method Not Allowed')
                    .writeHeader('content-type', 'application/json; charset=utf-8')
                    .writeHeader('allow', allow);
                if (isHead) {
                    res.writeHeader('content-length', len405).endWithoutBody();
                }
                else {
                    res.end(body405);
                }
            });
        });
    }
    // Register catch-all 404 Not Found
    const body404 = JSON.stringify({
        code: 'COMMON-404-NOT_FOUND',
        message: 'Route not found',
    });
    const len404 = String(Buffer.byteLength(body404));
    app.any('/*', (res, req) => {
        const isHead = req.getMethod() === 'head';
        res.cork(() => {
            res
                .writeStatus('404 Not Found')
                .writeHeader('content-type', 'application/json; charset=utf-8');
            if (isHead) {
                res.writeHeader('content-length', len404).endWithoutBody();
            }
            else {
                res.end(body404);
            }
        });
    });
}
