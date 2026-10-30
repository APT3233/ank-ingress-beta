import { PerformanceObserver, constants as perfConstants, monitorEventLoopDelay, performance } from 'node:perf_hooks';
const GC_KIND_NAMES = {
    [perfConstants.NODE_PERFORMANCE_GC_MINOR]: 'minor',
    [perfConstants.NODE_PERFORMANCE_GC_MAJOR]: 'major',
    [perfConstants.NODE_PERFORMANCE_GC_INCREMENTAL]: 'incremental',
    [perfConstants.NODE_PERFORMANCE_GC_WEAKCB]: 'weakcb',
};
export function registerProcessMetrics(registry) {
    const rssGauge = registry
        .gauge('ank_process_resident_memory_bytes', 'Resident set size memory in bytes')
        .bind();
    const heapUsedGauge = registry
        .gauge('ank_process_heap_used_bytes', 'V8 heap used memory in bytes')
        .bind();
    const heapTotalGauge = registry
        .gauge('ank_process_heap_total_bytes', 'V8 heap total memory in bytes')
        .bind();
    const externalGauge = registry
        .gauge('ank_process_external_memory_bytes', 'C++ external memory bound to V8 objects in bytes')
        .bind();
    const arrayBuffersGauge = registry
        .gauge('ank_process_array_buffers_bytes', 'Memory allocated for ArrayBuffers and SharedArrayBuffers in bytes')
        .bind();
    const elDelayGauge = registry.gauge('ank_process_eventloop_delay_seconds', 'Event loop delay quantiles in seconds', ['quantile']);
    const elDelayP50 = elDelayGauge.bind({ quantile: '0.5' });
    const elDelayP90 = elDelayGauge.bind({ quantile: '0.9' });
    const elDelayP99 = elDelayGauge.bind({ quantile: '0.99' });
    const elDelayMax = elDelayGauge.bind({ quantile: 'max' });
    const elDelayMean = elDelayGauge.bind({ quantile: 'mean' });
    const eluGauge = registry
        .gauge('ank_process_eventloop_utilization', 'Event loop utilization ratio (0..1)')
        .bind();
    const gcDuration = registry.histogram('ank_process_gc_duration_seconds', 'Garbage collection pause duration in seconds', ['kind'], [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25]);
    // Pre-bind standard GC kinds so series exist on /metrics even before a major GC occurs
    const gcBounds = {
        minor: gcDuration.bind({ kind: 'minor' }),
        major: gcDuration.bind({ kind: 'major' }),
        incremental: gcDuration.bind({ kind: 'incremental' }),
        weakcb: gcDuration.bind({ kind: 'weakcb' }),
        other: gcDuration.bind({ kind: 'other' }),
    };
    const elHist = monitorEventLoopDelay({ resolution: 20 });
    elHist.enable();
    let prevElu = performance.eventLoopUtilization();
    const sampleNow = () => {
        const mem = process.memoryUsage();
        rssGauge.set(mem.rss);
        heapUsedGauge.set(mem.heapUsed);
        heapTotalGauge.set(mem.heapTotal);
        externalGauge.set(mem.external);
        arrayBuffersGauge.set(mem.arrayBuffers);
        const p50 = elHist.percentile(50);
        const p90 = elHist.percentile(90);
        const p99 = elHist.percentile(99);
        const max = elHist.max;
        const mean = elHist.mean;
        elDelayP50.set(Number.isFinite(p50) ? p50 / 1e9 : 0);
        elDelayP90.set(Number.isFinite(p90) ? p90 / 1e9 : 0);
        elDelayP99.set(Number.isFinite(p99) ? p99 / 1e9 : 0);
        elDelayMax.set(Number.isFinite(max) && max < 1e15 ? max / 1e9 : 0);
        elDelayMean.set(Number.isFinite(mean) ? mean / 1e9 : 0);
        const currElu = performance.eventLoopUtilization();
        const diffElu = performance.eventLoopUtilization(currElu, prevElu);
        prevElu = currElu;
        eluGauge.set(Number.isFinite(diffElu.utilization) ? diffElu.utilization : 0);
    };
    sampleNow();
    registry.onCollect?.(sampleNow);
    let gcObserver = null;
    try {
        gcObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const detail = entry.detail;
                const kindNum = detail?.kind ?? entry.kind ?? 0;
                const kindName = GC_KIND_NAMES[kindNum] ?? 'other';
                const bound = gcBounds[kindName] ?? gcBounds.other;
                bound.observe(entry.duration / 1000);
            }
        });
        gcObserver.observe({ entryTypes: ['gc'] });
    }
    catch {
        gcObserver = null;
    }
    let closed = false;
    return {
        close() {
            if (closed)
                return;
            closed = true;
            elHist.disable();
            gcObserver?.disconnect();
        },
    };
}
