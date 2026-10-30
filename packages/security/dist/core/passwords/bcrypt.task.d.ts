export interface BcryptHashPayload {
    readonly password: string;
    readonly cost: number;
}
export interface BcryptComparePayload {
    readonly password: string;
    readonly hash: string;
}
declare const _default: {
    'security.bcrypt.hash'(payload: BcryptHashPayload): Promise<string>;
    'security.bcrypt.compare'(payload: BcryptComparePayload): Promise<boolean>;
};
export default _default;
