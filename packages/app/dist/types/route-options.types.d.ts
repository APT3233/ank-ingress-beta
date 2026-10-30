import type { TBoolean, TInteger, TNumber, TObject, TSchema, TString } from '@sinclair/typebox';
import type { HttpMethod, Reply, RequestOf, RouteSpec, ScopeOf } from '@ank-ingress/contracts';
export type FieldShorthand = 'string' | 'number' | 'integer' | 'boolean';
export type ShapeInput = {
    readonly [key: string]: FieldShorthand | TSchema;
};
export type SchemaInput = TSchema | ShapeInput;
type FieldSchema<F> = F extends 'string' ? TString : F extends 'number' ? TNumber : F extends 'integer' ? TInteger : F extends 'boolean' ? TBoolean : F extends TSchema ? F : never;
export type SchemaOf<S> = S extends TSchema ? S : S extends ShapeInput ? TObject<{
    -readonly [K in keyof S & string]: FieldSchema<S[K]>;
}> : undefined;
export type AccessOf<S extends string> = S extends 'public' ? {
    readonly kind: 'public';
} : S extends 'authenticated' ? {
    readonly kind: 'authenticated';
} : {
    readonly kind: 'permission';
    readonly code: string;
    readonly scopeParam?: string;
};
export type TxModeInput = 'none' | 'read' | 'write' | undefined;
export interface RouteOptionsBase<P extends SchemaInput | undefined, Q extends SchemaInput | undefined, B extends SchemaInput | undefined, TxMode extends TxModeInput> extends Omit<RouteSpec, 'method' | 'path' | 'access' | 'params' | 'query' | 'body' | 'tx' | 'handle'> {
    readonly scopeParam?: string;
    readonly params?: P;
    readonly query?: Q;
    readonly body?: B;
    readonly tx?: TxMode;
}
/** `access` is `'public'`, `'authenticated'`, or a catalog permission code; optional when the router has a default `DA`. */
export type RouteOptions<A extends string, P extends SchemaInput | undefined, Q extends SchemaInput | undefined, B extends SchemaInput | undefined, TxMode extends TxModeInput, DA extends string = never> = RouteOptionsBase<P, Q, B, TxMode> & ([DA] extends [never] ? {
    readonly access: A;
} : {
    readonly access?: A;
});
export type RouteHandler<A extends string, P extends SchemaInput | undefined, Q extends SchemaInput | undefined, B extends SchemaInput | undefined, Path extends string, M extends HttpMethod, TxMode extends TxModeInput, Tx, AccessCtx> = (req: RequestOf<AccessOf<A>, SchemaOf<P>, SchemaOf<Q>, SchemaOf<B>, Path>, scope: ScopeOf<AccessOf<A>, Tx, AccessCtx, M, TxMode>) => Reply | Promise<Reply>;
export type MethodRegistrar<M extends HttpMethod, Tx, AccessCtx, Self, DA extends string = never> = <const Path extends string, const A extends string = DA, const P extends SchemaInput | undefined = undefined, const Q extends SchemaInput | undefined = undefined, const B extends SchemaInput | undefined = undefined, const TxMode extends TxModeInput = undefined>(path: Path, options: RouteOptions<A, P, Q, B, TxMode, DA>, handler: RouteHandler<A, P, Q, B, Path, M, TxMode, Tx, AccessCtx>) => Self;
export type PathRegistrar<M extends HttpMethod, Path extends string, Tx, AccessCtx, Self, DA extends string = never> = <const A extends string = DA, const P extends SchemaInput | undefined = undefined, const Q extends SchemaInput | undefined = undefined, const B extends SchemaInput | undefined = undefined, const TxMode extends TxModeInput = undefined>(options: RouteOptions<A, P, Q, B, TxMode, DA>, handler: RouteHandler<A, P, Q, B, Path, M, TxMode, Tx, AccessCtx>) => Self;
export {};
