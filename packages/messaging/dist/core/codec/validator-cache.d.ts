import { type TypeCheck } from '@sinclair/typebox/compiler';
import type { TSchema } from '@sinclair/typebox';
import type { EventSpec } from '@ank-ingress/contracts';
export declare function getValidator(spec: EventSpec): TypeCheck<TSchema>;
