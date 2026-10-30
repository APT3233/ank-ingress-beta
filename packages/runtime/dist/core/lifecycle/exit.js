export const EXIT = Object.freeze({ OK: 0, FAILURE: 1, CONFIG: 78 });
export class StartupError extends Error {
    exitCode = EXIT.CONFIG;
    constructor(message, options) {
        super(message, options);
        this.name = 'StartupError';
    }
}
export function exitCodeOf(error) {
    const code = error?.exitCode;
    return typeof code === 'number' && Number.isInteger(code) ? code : EXIT.FAILURE;
}
