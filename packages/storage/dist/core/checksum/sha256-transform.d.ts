import { Transform } from 'node:stream';
export interface Sha256Stream extends Transform {
    digest(): string;
}
export declare function sha256Transform(): Sha256Stream;
