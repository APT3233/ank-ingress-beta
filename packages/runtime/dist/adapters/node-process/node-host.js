import { hostname } from 'node:os';
import { startProcess } from "../../core/lifecycle/start-process.js";
export function nodeHost(lingerMs = 2_000) {
    return {
        env: process.env,
        hostname: hostname(),
        pid: process.pid,
        nodeVersion: process.version,
        onSignal: (signal, handler) => void process.on(signal, handler),
        onFatal: (handler) => {
            process.on('uncaughtException', handler);
            process.on('unhandledRejection', handler);
        },
        exit: (code) => {
            process.exitCode = code;
            setTimeout(() => process.exit(code), lingerMs).unref();
        },
    };
}
export function runProcess(def) {
    return startProcess(def, nodeHost());
}
