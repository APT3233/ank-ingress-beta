export function formatSseFrame(id, event, data) {
    if (/[\r\n\0]/.test(id) || /[\r\n\0]/.test(event)) {
        throw new TypeError('SSE id and event must be single lines without NUL');
    }
    const json = typeof data === 'string' ? data : JSON.stringify(data);
    const lines = json.split(/\r\n|\r|\n/).map((line) => `data: ${line}`).join('\n');
    return `id: ${id}\nevent: ${event}\n${lines}\n\n`;
}
