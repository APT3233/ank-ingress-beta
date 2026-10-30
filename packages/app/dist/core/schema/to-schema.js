import { Kind, Type } from '@sinclair/typebox';
import { CompositionError } from '@ank-ingress/kernel';
const FIELD_SCHEMAS = {
    string: () => Type.String(),
    number: () => Type.Number(),
    integer: () => Type.Integer(),
    boolean: () => Type.Boolean(),
};
export function toSchema(input) {
    if (input === undefined || Kind in input)
        return input;
    const properties = {};
    for (const [key, field] of Object.entries(input)) {
        if (typeof field !== 'string') {
            properties[key] = field;
            continue;
        }
        const make = FIELD_SCHEMAS[field];
        if (!make)
            throw new CompositionError(`Unknown field type "${field}" for "${key}"`);
        properties[key] = make();
    }
    return Type.Object(properties);
}
