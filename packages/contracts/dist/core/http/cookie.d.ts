export interface CookieOptions {
    readonly maxAgeSeconds?: number;
    readonly expires?: Date;
    /** Defaults to `/`. */
    readonly path?: string;
    readonly domain?: string;
    readonly secure?: boolean;
    /** Defaults to `true`. */
    readonly httpOnly?: boolean;
    /** Defaults to `lax`; `none` requires `secure`. */
    readonly sameSite?: 'strict' | 'lax' | 'none';
    /** CHIPS partitioned cookie; requires `secure`. */
    readonly partitioned?: boolean;
}
/** Serializes one `Set-Cookie` header value; the value is URI-encoded (read back by `req.cookies`). */
export declare function serializeCookie(name: string, value: string, options?: CookieOptions): string;
/** A `Set-Cookie` value that deletes `name`; pass the same path/domain it was set with. */
export declare function clearCookie(name: string, options?: Omit<CookieOptions, 'maxAgeSeconds' | 'expires'>): string;
