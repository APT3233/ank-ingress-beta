import type { TSchema } from '@sinclair/typebox';
export declare function compileBodyValidator(schema: TSchema | undefined): ((value: unknown) => unknown) | null;
export declare function compileStringMapValidator(schema: TSchema | undefined, cloneInput: boolean): ((raw: Record<string, string>) => Record<string, unknown>) | null;
export declare function compileResponseSerializer(schema: TSchema | undefined): ((value: unknown) => string) | null;
