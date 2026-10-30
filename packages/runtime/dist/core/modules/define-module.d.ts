import type { Schema } from '@ank-ingress/config';
import type { ModuleContributions, ModuleDefinition } from '../../types/module.types.js';
/** Fix the process `Tx`/`Access` first, then let each contribution keep its own literal `needs` and `build` types. */
export declare function defineModule<Tx = unknown, Access = unknown>(): <const Contribs extends ModuleContributions<Tx, Access>, S extends Schema = Schema>(def: ModuleDefinition<Tx, Access, Contribs, S>) => ModuleDefinition<Tx, Access, Contribs, S>;
