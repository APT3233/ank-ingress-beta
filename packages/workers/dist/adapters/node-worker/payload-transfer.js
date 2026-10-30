export function copyViewToOwnedBuffer(view) {
    const ab = new ArrayBuffer(view.byteLength);
    new Uint8Array(ab).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    if (Buffer.isBuffer(view) || view instanceof Uint8Array) {
        return { view: new Uint8Array(ab), buffer: ab };
    }
    const Ctor = view.constructor;
    return { view: new Ctor(ab), buffer: ab };
}
export function preparePayloadAndTransfer(payload, transfer) {
    if (payload instanceof ArrayBuffer) {
        return {
            payload,
            transfer: transfer ? [...transfer] : [],
        };
    }
    if (ArrayBuffer.isView(payload) && payload.buffer instanceof ArrayBuffer) {
        const needsCopy = Buffer.isBuffer(payload) ||
            payload.byteOffset !== 0 ||
            payload.byteLength !== payload.buffer.byteLength;
        if (needsCopy) {
            const copied = copyViewToOwnedBuffer(payload);
            const nextTransfer = transfer
                ? transfer.map((item) => (item === payload.buffer ? copied.buffer : item))
                : [];
            return {
                payload: copied.view,
                transfer: nextTransfer,
            };
        }
        return {
            payload,
            transfer: transfer ? [...transfer] : [],
        };
    }
    if (payload !== null &&
        typeof payload === 'object' &&
        !Array.isArray(payload) &&
        transfer &&
        transfer.length > 0) {
        let clonedObj = null;
        const nextTransfer = [...transfer];
        for (const [k, v] of Object.entries(payload)) {
            if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) {
                const idx = nextTransfer.indexOf(v.buffer);
                const needsCopy = Buffer.isBuffer(v) || v.byteOffset !== 0 || v.byteLength !== v.buffer.byteLength;
                if (idx !== -1 && needsCopy) {
                    const copied = copyViewToOwnedBuffer(v);
                    nextTransfer[idx] = copied.buffer;
                    clonedObj ??= { ...payload };
                    clonedObj[k] = copied.view;
                }
            }
        }
        if (clonedObj) {
            return { payload: clonedObj, transfer: nextTransfer };
        }
    }
    return {
        payload,
        transfer: transfer ? [...transfer] : [],
    };
}
