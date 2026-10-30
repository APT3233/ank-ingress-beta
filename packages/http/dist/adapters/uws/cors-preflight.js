import { PREFLIGHT_VARY, compileCorsPolicy } from "../../core/cors/cors-policy.js";
export function compileCors(options) {
    const { allowOrigin, responseHeaders, responseSuffix, preflightHeaders } = compileCorsPolicy(options);
    return {
        allowOrigin,
        responseHeaders,
        responseSuffix,
        writePreflight(res, value, allowMethods) {
            res.writeStatus('204 No Content');
            const allowValue = value === '' ? null : allowOrigin(value);
            if (allowValue === null) {
                res.writeHeader('vary', PREFLIGHT_VARY);
            }
            else {
                res.writeHeader('access-control-allow-origin', allowValue);
                res.writeHeader('access-control-allow-methods', allowMethods);
                for (let i = 0; i < preflightHeaders.length; i += 2) {
                    res.writeHeader(preflightHeaders[i], preflightHeaders[i + 1]);
                }
            }
            res.endWithoutBody();
        },
    };
}
