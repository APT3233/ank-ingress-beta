import { TypeCompiler } from '@sinclair/typebox/compiler';
const validatorCache = new WeakMap();
export function getValidator(spec) {
    let check = validatorCache.get(spec);
    if (!check) {
        check = TypeCompiler.Compile(spec.schema);
        validatorCache.set(spec, check);
    }
    return check;
}
