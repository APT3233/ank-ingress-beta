export interface HttpLimits {
    readonly maxInFlight?: number;
    readonly defaultTimeoutMs?: number;
    readonly defaultMaxBodyBytes?: number;
    readonly authzTimeoutMs?: number;
    readonly trustedProxies?: readonly string[];
    readonly trustUnixSocket?: boolean;
}
