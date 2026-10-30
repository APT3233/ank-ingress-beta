import type { LoadedConfig, LoadOptions, Schema } from '../../types/config.types.js';
export declare function loadConfig<S extends Schema>(schema: S, options?: LoadOptions): LoadedConfig<S>;
