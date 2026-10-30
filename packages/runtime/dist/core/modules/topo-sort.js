import { CompositionError } from '@ank-ingress/kernel';
export function topoSortModules(defs) {
    const byName = new Map();
    for (const def of defs) {
        if (byName.has(def.name)) {
            throw new CompositionError(`Duplicate module name "${def.name}"`);
        }
        byName.set(def.name, def);
    }
    for (const def of defs) {
        for (const req of def.requires) {
            if (!byName.has(req)) {
                throw new CompositionError(`Module "${def.name}" requires unknown module "${req}"`);
            }
        }
    }
    const state = new Map();
    const sorted = [];
    const visit = (node, stack) => {
        const st = state.get(node.name);
        if (st === 'visited')
            return;
        if (st === 'visiting') {
            throw new CompositionError(`Circular module dependency detected: ${[...stack, node.name].join(' -> ')}`);
        }
        state.set(node.name, 'visiting');
        for (const reqName of node.requires) {
            const reqNode = byName.get(reqName);
            visit(reqNode, [...stack, node.name]);
        }
        state.set(node.name, 'visited');
        sorted.push(node);
    };
    for (const def of defs) {
        visit(def, []);
    }
    return sorted;
}
