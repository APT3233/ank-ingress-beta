import { type KeyObject } from 'node:crypto';
export declare const b64url: (data: Buffer | string) => string;
export declare function parsePrivateKey(base64Pkcs8: string): KeyObject;
export declare function parsePublicKey(rawPublicKey: string): KeyObject;
export declare function parsePublicKeyMap(raw: string): ReadonlyMap<string, KeyObject>;
export declare function publicKeyBase64(privateKey: KeyObject): string;
