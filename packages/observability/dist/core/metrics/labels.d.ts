import type { Labels } from '../../types/metrics.types.js';
export declare const METRIC_NAME: RegExp;
export declare function escapeLabelValue(value: string): string;
export declare function formatLabels(labelNames: readonly string[], labels?: Labels): string;
