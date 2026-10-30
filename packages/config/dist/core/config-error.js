export class ConfigError extends Error {
    exitCode = 78;
    problems;
    constructor(problems) {
        super(`Invalid configuration: ${problems.join('; ')}`);
        this.name = 'ConfigError';
        this.problems = Object.freeze([...problems]);
    }
}
