const BODY_MEDIA_TYPES = {
    json: 'application/json',
    urlencoded: 'application/x-www-form-urlencoded',
    text: 'text/plain',
    multipart: 'multipart/form-data',
};
function toOpenApiPath(uwsPath) {
    return uwsPath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
}
export function generateOpenApi(routes, _catalogs, info = { title: 'ANK Ingress API', version: '2.0.0' }) {
    const paths = {};
    for (const route of routes) {
        const oapiPath = toOpenApiPath(route.path);
        const methodKey = route.method.toLowerCase();
        paths[oapiPath] ??= {};
        const parameters = [];
        if (route.params && 'properties' in route.params) {
            const props = route.params.properties;
            for (const [name, schema] of Object.entries(props)) {
                parameters.push({
                    name,
                    in: 'path',
                    required: true,
                    schema,
                });
            }
        }
        if (route.query && 'properties' in route.query) {
            const props = route.query.properties;
            const reqSet = new Set(route.query.required ?? []);
            for (const [name, schema] of Object.entries(props)) {
                parameters.push({
                    name,
                    in: 'query',
                    required: reqSet.has(name),
                    schema,
                });
            }
        }
        const requestBody = route.bodyFormat === 'multipart'
            ? { required: true, content: { 'multipart/form-data': { schema: { type: 'object' } } } }
            : route.body
                ? {
                    required: true,
                    content: {
                        [BODY_MEDIA_TYPES[route.bodyFormat ?? 'json']]: {
                            schema: route.body,
                        },
                    },
                }
                : undefined;
        const responses = {
            200: route.response
                ? {
                    description: 'Success',
                    content: {
                        'application/json': {
                            schema: route.response,
                        },
                    },
                }
                : { description: 'Success' },
        };
        paths[oapiPath][methodKey] = {
            operationId: `${methodKey}_${route.path.replace(/[^a-zA-Z0-9]+/g, '_')}`,
            ...(parameters.length > 0 ? { parameters } : {}),
            ...(requestBody ? { requestBody } : {}),
            responses,
            ...(route.access.kind !== 'public' ? { security: [{ bearerAuth: [] }] } : {}),
        };
    }
    return Object.freeze({
        openapi: '3.1.0',
        info,
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
        paths,
    });
}
