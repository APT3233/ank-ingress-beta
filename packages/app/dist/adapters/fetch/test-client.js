/**
 * Listens on an ephemeral 127.0.0.1 port and sends real HTTP requests through uWS, so tests cover
 * the same pipeline as production. Redirects are not followed. The app is sealed, as after `listen()`.
 */
export async function createTestClient(app) {
    const server = await app.listen(0, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${server.port}${app.prefix}`;
    const request = (method, path, init = {}) => {
        const url = new URL(path === '/' ? baseUrl : `${baseUrl}${path}`);
        for (const [key, value] of Object.entries(init.query ?? {}))
            url.searchParams.set(key, String(value));
        const headers = { ...init.headers };
        let body = init.body;
        if (init.json !== undefined) {
            body = JSON.stringify(init.json);
            headers['content-type'] ??= 'application/json';
        }
        return fetch(url, { method, headers, ...(body === undefined ? {} : { body }), redirect: 'manual' });
    };
    const bind = (method) => (path, init) => request(method, path, init);
    return {
        baseUrl,
        request,
        get: bind('GET'),
        post: bind('POST'),
        put: bind('PUT'),
        patch: bind('PATCH'),
        delete: bind('DELETE'),
        head: bind('HEAD'),
        options: bind('OPTIONS'),
        close: () => server.close(),
    };
}
