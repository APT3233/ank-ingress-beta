import { DEFAULT_LATENCY_BUCKETS } from "../../types/metrics.types.js";
import { METRIC_NAME, formatLabels } from "./labels.js";
export function createMetricsRegistry() {
    const renderers = new Map();
    const collectors = [];
    const register = (name, render) => {
        if (!METRIC_NAME.test(name)) {
            throw new TypeError(`Invalid metric name: ${name}`);
        }
        if (renderers.has(name)) {
            throw new TypeError(`Duplicate metric registration: ${name}`);
        }
        renderers.set(name, render);
    };
    return {
        counter(name, help, labelNames = []) {
            const slots = new Map();
            const getOrBind = (labels) => {
                const key = formatLabels(labelNames, labels);
                let slot = slots.get(key);
                if (!slot) {
                    const entry = {
                        value: 0,
                        bound: {
                            inc(delta = 1) {
                                if (delta < 0 || !Number.isFinite(delta)) {
                                    throw new RangeError('Counter increment must be a non-negative finite number');
                                }
                                entry.value += delta;
                            },
                            get() {
                                return entry.value;
                            },
                        },
                    };
                    slot = entry;
                    slots.set(key, slot);
                }
                return slot.bound;
            };
            register(name, () => {
                const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} counter`];
                if (slots.size === 0 && labelNames.length === 0) {
                    lines.push(`${name} 0`);
                }
                else {
                    for (const [k, slot] of slots) {
                        lines.push(`${name}${k ? `{${k}}` : ''} ${slot.value}`);
                    }
                }
                return lines.join('\n');
            });
            return {
                inc(labels, delta = 1) {
                    getOrBind(labels).inc(delta);
                },
                bind(labels) {
                    return getOrBind(labels);
                },
                seriesCount() {
                    return slots.size;
                },
            };
        },
        gauge(name, help, labelNames = []) {
            const slots = new Map();
            const getOrBind = (labels) => {
                const key = formatLabels(labelNames, labels);
                let slot = slots.get(key);
                if (!slot) {
                    const entry = {
                        value: 0,
                        bound: {
                            set(v) {
                                if (!Number.isFinite(v))
                                    throw new RangeError('Gauge value must be finite');
                                entry.value = v;
                            },
                            inc(delta = 1) {
                                entry.value += delta;
                            },
                            dec(delta = 1) {
                                entry.value -= delta;
                            },
                            get() {
                                return entry.value;
                            },
                        },
                    };
                    slot = entry;
                    slots.set(key, slot);
                }
                return slot.bound;
            };
            register(name, () => {
                const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`];
                if (slots.size === 0 && labelNames.length === 0) {
                    lines.push(`${name} 0`);
                }
                else {
                    for (const [k, slot] of slots) {
                        lines.push(`${name}${k ? `{${k}}` : ''} ${slot.value}`);
                    }
                }
                return lines.join('\n');
            });
            return {
                set(labelsOrValue, value) {
                    if (typeof labelsOrValue === 'number') {
                        getOrBind().set(labelsOrValue);
                    }
                    else {
                        getOrBind(labelsOrValue).set(value ?? 0);
                    }
                },
                inc(labels, delta = 1) {
                    getOrBind(labels).inc(delta);
                },
                dec(labels, delta = 1) {
                    getOrBind(labels).dec(delta);
                },
                bind(labels) {
                    return getOrBind(labels);
                },
                seriesCount() {
                    return slots.size;
                },
            };
        },
        histogram(name, help, labelNames = [], buckets = DEFAULT_LATENCY_BUCKETS) {
            const sortedBuckets = [...buckets].sort((a, b) => a - b);
            const bucketCount = sortedBuckets.length;
            const slots = new Map();
            const getOrBind = (labels) => {
                const key = formatLabels(labelNames, labels);
                let slot = slots.get(key);
                if (!slot) {
                    const counts = new Float64Array(bucketCount);
                    const entry = {
                        counts,
                        count: 0,
                        sum: 0,
                        bound: {
                            observe(value) {
                                if (!Number.isFinite(value))
                                    return;
                                entry.count += 1;
                                entry.sum += value;
                                for (let i = 0; i < bucketCount; i++) {
                                    if (value <= sortedBuckets[i]) {
                                        counts[i] += 1;
                                        break;
                                    }
                                }
                            },
                        },
                    };
                    slot = entry;
                    slots.set(key, slot);
                }
                return slot.bound;
            };
            register(name, () => {
                const lines = [`# HELP ${name} ${help}`, `# TYPE ${name} histogram`];
                for (const [k, slot] of slots) {
                    const prefix = k ? `${k},` : '';
                    let cumulative = 0;
                    for (let i = 0; i < bucketCount; i++) {
                        cumulative += slot.counts[i];
                        lines.push(`${name}_bucket{${prefix}le="${sortedBuckets[i]}"} ${cumulative}`);
                    }
                    lines.push(`${name}_bucket{${prefix}le="+Inf"} ${slot.count}`);
                    const sumRounded = Math.round(slot.sum * 1e9) / 1e9;
                    lines.push(`${name}_sum${k ? `{${k}}` : ''} ${sumRounded}`);
                    lines.push(`${name}_count${k ? `{${k}}` : ''} ${slot.count}`);
                }
                return lines.join('\n');
            });
            return {
                observe(labelsOrValue, value) {
                    if (typeof labelsOrValue === 'number') {
                        getOrBind().observe(labelsOrValue);
                    }
                    else {
                        getOrBind(labelsOrValue).observe(value ?? 0);
                    }
                },
                bind(labels) {
                    return getOrBind(labels);
                },
                seriesCount() {
                    return slots.size;
                },
            };
        },
        onCollect(fn) {
            collectors.push(fn);
        },
        render() {
            for (let i = 0; i < collectors.length; i++) {
                collectors[i]();
            }
            return [...renderers.values()].map((fn) => fn()).join('\n\n') + '\n';
        },
    };
}
