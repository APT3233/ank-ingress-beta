export const METRIC_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
export function escapeLabelValue(value) {
    return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"');
}
export function formatLabels(labelNames, labels) {
    if (labelNames.length === 0)
        return '';
    const parts = [];
    for (let i = 0; i < labelNames.length; i++) {
        const k = labelNames[i];
        const raw = labels?.[k];
        if (raw === undefined) {
            throw new TypeError(`Missing metric label: ${k}`);
        }
        parts.push(`${k}="${escapeLabelValue(String(raw))}"`);
    }
    return parts.join(',');
}
