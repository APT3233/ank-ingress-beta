import type { AnyRoute } from '@ank-ingress/contracts';
import type { CompiledRoute } from '../../types/compiled-route.types.js';
import type { CompileDependencies } from '../../types/stages.types.js';
export declare function compileRoute(spec: AnyRoute, deps: CompileDependencies): CompiledRoute;
