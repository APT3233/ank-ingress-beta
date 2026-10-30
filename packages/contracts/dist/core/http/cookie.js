const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const ATTRIBUTE_VALUE = /^[^\0-\x1f\x7f;]*$/;
function attribute(name, value) {
    if (!ATTRIBUTE_VALUE.test(value)) {
        throw new TypeError(`Cookie ${name} must not contain control characters or ";"`);
    }
    return `; ${name}=${value}`;
}
/** Serializes one `Set-Cookie` header value; the value is URI-encoded (read back by `req.cookies`). */
export function serializeCookie(name, value, options = {}) {
    if (!COOKIE_NAME.test(name)) {
        throw new TypeError(`Invalid cookie name "${name}"`);
    }
    const { path = '/', httpOnly = true, sameSite = 'lax' } = options;
    if ((sameSite === 'none' || options.partitioned) && !options.secure) {
        throw new TypeError(`Cookie "${name}" with SameSite=None or Partitioned must be secure`);
    }
    let out = `${name}=${encodeURIComponent(value)}`;
    if (options.maxAgeSeconds !== undefined)
        out += `; Max-Age=${Math.floor(options.maxAgeSeconds)}`;
    if (options.expires !== undefined)
        out += `; Expires=${options.expires.toUTCString()}`;
    if (options.domain !== undefined)
        out += attribute('Domain', options.domain);
    out += attribute('Path', path);
    if (options.secure)
        out += '; Secure';
    if (httpOnly)
        out += '; HttpOnly';
    out += `; SameSite=${sameSite === 'strict' ? 'Strict' : sameSite === 'none' ? 'None' : 'Lax'}`;
    if (options.partitioned)
        out += '; Partitioned';
    return out;
}
/** A `Set-Cookie` value that deletes `name`; pass the same path/domain it was set with. */
export function clearCookie(name, options = {}) {
    return serializeCookie(name, '', { ...options, maxAgeSeconds: 0, expires: new Date(0) });
}
