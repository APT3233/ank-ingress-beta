const BOUNDARY_PARAM = /(?:^|;)\s*boundary\s*=\s*(?:"([^"]{1,70})"|([^\s;"]{1,70}))/i;
/** Boundary from a `multipart/form-data` Content-Type, or null when the header is not one. */
export function multipartBoundary(contentType) {
    if (!contentType || !/^\s*multipart\/form-data\s*(;|$)/i.test(contentType))
        return null;
    const match = BOUNDARY_PARAM.exec(contentType.slice(contentType.indexOf(';')));
    return match ? (match[1] ?? match[2]) : null;
}
