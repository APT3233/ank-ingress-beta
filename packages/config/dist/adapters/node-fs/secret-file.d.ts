import type { Field, SecretHolder } from '../../types/config.types.js';
export declare function secretFile(env: string): Field<SecretHolder>;
export declare function optionalSecretFile(env: string): Field<SecretHolder | null>;
