export type ListenConfig = {
    readonly kind: 'unix';
    readonly path: string;
    readonly mode?: number;
    readonly trustedIngress?: boolean;
} | {
    readonly kind: 'tcp';
    readonly host: string;
    readonly port: number;
};
