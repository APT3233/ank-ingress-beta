const STATUS_TEXT = {
    200: '200 OK',
    201: '201 Created',
    202: '202 Accepted',
    204: '204 No Content',
    304: '304 Not Modified',
    301: '301 Moved Permanently',
    302: '302 Found',
    303: '303 See Other',
    307: '307 Temporary Redirect',
    308: '308 Permanent Redirect',
    400: '400 Bad Request',
    401: '401 Unauthorized',
    403: '403 Forbidden',
    404: '404 Not Found',
    405: '405 Method Not Allowed',
    409: '409 Conflict',
    413: '413 Payload Too Large',
    415: '415 Unsupported Media Type',
    422: '422 Unprocessable Entity',
    423: '423 Locked',
    429: '429 Too Many Requests',
    500: '500 Internal Server Error',
    503: '503 Service Unavailable',
};
export function statusLine(code) {
    return STATUS_TEXT[code] ?? `${code} Status`;
}
