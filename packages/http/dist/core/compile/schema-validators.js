import { TypeCompiler } from '@sinclair/typebox/compiler';
import { Value } from '@sinclair/typebox/value';
import fastJsonStringify from 'fast-json-stringify';
import { validationError } from '@ank-ingress/kernel';
function buildPropertyCoercer(propSchema) {
    const directType = propSchema.type;
    const unionTypes = Array.isArray(propSchema.anyOf)
        ? propSchema.anyOf.map((s) => s.type)
        : [];
    const types = directType ? [directType] : unionTypes;
    const wantsNumber = types.includes('integer') || types.includes('number');
    const wantsBoolean = types.includes('boolean');
    if (wantsNumber && !wantsBoolean) {
        return (raw) => {
            if (raw === '' || raw.trim() === '')
                return raw;
            const n = Number(raw);
            return Number.isNaN(n) ? raw : n;
        };
    }
    if (wantsBoolean && !wantsNumber) {
        return (raw) => {
            const lower = raw.toLowerCase();
            if (lower === 'true' || lower === '1')
                return true;
            if (lower === 'false' || lower === '0')
                return false;
            return raw;
        };
    }
    if (wantsNumber && wantsBoolean) {
        return (raw) => {
            const lower = raw.toLowerCase();
            if (lower === 'true')
                return true;
            if (lower === 'false')
                return false;
            if (raw !== '' && raw.trim() !== '') {
                const n = Number(raw);
                if (!Number.isNaN(n))
                    return n;
            }
            return raw;
        };
    }
    return null;
}
function compileObjectCoercer(schema) {
    const objSchema = schema;
    const props = objSchema.properties;
    if (!props || typeof props !== 'object') {
        return null;
    }
    const entries = [];
    for (const [key, propSchema] of Object.entries(props)) {
        if (propSchema && typeof propSchema === 'object') {
            const coercer = buildPropertyCoercer(propSchema);
            if (coercer) {
                entries.push([key, coercer]);
            }
        }
    }
    if (entries.length === 0) {
        return (target) => target;
    }
    const len = entries.length;
    return (target) => {
        for (let i = 0; i < len; i++) {
            const [key, coerce] = entries[i];
            const val = target[key];
            if (typeof val === 'string') {
                target[key] = coerce(val);
            }
        }
        return target;
    };
}
function throwSchemaValidationError(schema, compiled, candidate) {
    const errors = compiled ? [...compiled.Errors(candidate)] : [...Value.Errors(schema, candidate)];
    const details = errors.map((e) => {
        const field = e.path.replace(/^\//, '').replaceAll('/', '.');
        return {
            ...(field ? { field } : {}),
            code: 'COMMON-422-INVALID_FIELD',
        };
    });
    throw validationError(details.length > 0 ? details : [{ code: 'COMMON-422-INVALID_FIELD' }], 'Schema validation failed');
}
function compileCheck(schema) {
    try {
        return TypeCompiler.Compile(schema);
    }
    catch {
        return null;
    }
}
export function compileBodyValidator(schema) {
    if (!schema)
        return null;
    const compiled = compileCheck(schema);
    return (input) => {
        const ok = compiled ? compiled.Check(input) : Value.Check(schema, input);
        if (!ok) {
            throwSchemaValidationError(schema, compiled, input);
        }
        return input;
    };
}
export function compileStringMapValidator(schema, cloneInput) {
    if (!schema)
        return null;
    const compiled = compileCheck(schema);
    const coercer = compileObjectCoercer(schema);
    return (raw) => {
        const target = cloneInput ? { ...raw } : raw;
        const candidate = coercer
            ? coercer(target)
            : Value.Convert(schema, target);
        const ok = compiled ? compiled.Check(candidate) : Value.Check(schema, candidate);
        if (!ok) {
            throwSchemaValidationError(schema, compiled, candidate);
        }
        return candidate;
    };
}
export function compileResponseSerializer(schema) {
    if (!schema)
        return null;
    const stringify = fastJsonStringify(schema);
    return (value) => stringify(value);
}
