export function joinPath(base, path) {
    if (path === '/')
        return base;
    if (base === '/')
        return path;
    return `${base}${path}`;
}
