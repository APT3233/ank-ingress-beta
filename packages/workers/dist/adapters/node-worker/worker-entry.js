var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { parentPort, workerData } from 'node:worker_threads';
const handlers = new Map();
const moduleCache = new Map();
async function loadTasks(specs) {
    for (const spec of specs) {
        let mod = moduleCache.get(spec.moduleUrl);
        if (!mod) {
            mod = (await import(__rewriteRelativeImportExtension(spec.moduleUrl)));
            moduleCache.set(spec.moduleUrl, mod);
        }
        const defaultExport = mod.default;
        const fn = (typeof mod[spec.name] === 'function' ? mod[spec.name] : undefined) ??
            (typeof defaultExport === 'object' && defaultExport && typeof defaultExport[spec.name] === 'function'
                ? defaultExport[spec.name]
                : undefined) ??
            (typeof defaultExport === 'function' ? defaultExport : undefined);
        if (typeof fn !== 'function') {
            throw new Error(`Worker task "${spec.name}" not found in "${spec.moduleUrl}"`);
        }
        handlers.set(spec.name, fn);
    }
}
function prepareTransferResult(value) {
    if (value instanceof ArrayBuffer) {
        return { result: value, transfer: [value] };
    }
    if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) {
        if (Buffer.isBuffer(value) ||
            value.byteOffset !== 0 ||
            value.byteLength !== value.buffer.byteLength) {
            const ab = new ArrayBuffer(value.byteLength);
            new Uint8Array(ab).set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
            if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
                return { result: new Uint8Array(ab), transfer: [ab] };
            }
            const Ctor = value.constructor;
            return { result: new Ctor(ab), transfer: [ab] };
        }
        return { result: value, transfer: [value.buffer] };
    }
    return { result: value, transfer: [] };
}
const tasks = workerData?.tasks ?? [];
await loadTasks(tasks);
parentPort?.postMessage({ ready: true });
parentPort?.on('message', async (msg) => {
    const { id, task, payload } = msg;
    const handler = handlers.get(task);
    if (!handler) {
        parentPort?.postMessage({
            id,
            ok: false,
            error: { message: `Unknown worker task: ${task}`, code: 'COMMON-500-INTERNAL' },
        });
        return;
    }
    try {
        const rawResult = await handler(payload);
        const { result, transfer } = prepareTransferResult(rawResult);
        if (transfer.length > 0) {
            try {
                parentPort?.postMessage({ id, ok: true, result }, transfer);
            }
            catch {
                // Fallback to structured clone if transfer list contained an untransferable buffer
                parentPort?.postMessage({ id, ok: true, result: rawResult });
            }
        }
        else {
            parentPort?.postMessage({ id, ok: true, result });
        }
    }
    catch (err) {
        try {
            parentPort?.postMessage({
                id,
                ok: false,
                error: {
                    message: err instanceof Error ? err.message : String(err),
                    code: typeof err?.code === 'string'
                        ? err.code
                        : 'COMMON-500-INTERNAL',
                },
            });
        }
        catch {
            // Ignore if parentPort is already closed
        }
    }
});
