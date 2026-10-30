export function compositeInbound(parts) {
    return {
        async start() {
            for (const part of parts) {
                await part.start();
            }
        },
        async pause() {
            await Promise.all(parts.map((p) => p.pause?.()));
        },
        async resume() {
            await Promise.all(parts.map((p) => p.resume?.()));
        },
        async stop() {
            await Promise.all(parts.map((p) => p.stop()));
        },
        async drain(signal) {
            await Promise.all(parts.map((p) => p.drain(signal)));
        },
        async release() {
            for (const part of parts) {
                await part.release?.();
            }
        },
    };
}
