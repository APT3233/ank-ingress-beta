import type { TransferListItem } from 'node:worker_threads';
export declare function copyViewToOwnedBuffer(view: ArrayBufferView): {
    readonly view: ArrayBufferView;
    readonly buffer: ArrayBuffer;
};
export declare function preparePayloadAndTransfer(payload: unknown, transfer: readonly TransferListItem[] | undefined): {
    readonly payload: unknown;
    readonly transfer: TransferListItem[];
};
