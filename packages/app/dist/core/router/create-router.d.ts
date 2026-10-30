import type { Router, RouterDefaults } from '../../types/router.types.js';
/**
 * With explicit `Tx`/`AccessCtx` type arguments, also pass the default access type:
 * `createRouter<Tx, Ctx, 'notes:read'>({ access: 'notes:read' })`.
 */
export declare function createRouter<Tx = unknown, AccessCtx = unknown, const DA extends string = never>(defaults?: RouterDefaults<DA>): Router<Tx, AccessCtx, DA>;
