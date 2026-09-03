/**
 * Aberration (outbreak) detection over daily syndrome counts.
 *
 * Three complementary detectors are run over the same series and their
 * verdicts combined, which is what CDC EARS does in practice:
 *   - EARS C1/C2/C3  : short-baseline shift detectors, robust when only a few
 *                      days of history exist (a camp opens and closes in days).
 *   - EWMA           : catches slow, sustained rises that C1-C3 miss.
 *   - Poisson CUSUM  : cumulative-sum detector for small counts.
 *
 * Every detector returns the statistic and the threshold it was compared
 * against so the dashboard can explain *why* an alert fired.
 */

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface DetectorResult {
  method: 'C1' | 'C2' | 'C3' | 'EWMA' | 'CUSUM';
  statistic: number;
  threshold: number;
  alarm: boolean;
  /** Expected count from the detector's own baseline, for the tooltip. */
  expected: number;
  detail: string;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

export const BASELINE_DAYS = 7;
export const EARS_THRESHOLD = 3;

/**
 * Shewhart-style score over a 7-day baseline ending `guardDays` before today.
 * C1 uses no guard band, C2 a 2-day guard band so a slow-building outbreak
 * does not contaminate its own baseline.
 */
function earsScore(counts: number[], guardDays: number): { score: number; expected: number; sd: number } {
  const end = counts.length - 1 - guardDays;
  const start = end - BASELINE_DAYS;
  if (start < 0 || end <= start) return { score: 0, expected: 0, sd: 0 };

  const baseline = counts.slice(start, end);
  const observed = counts[counts.length - 1] ?? 0;
  const mu = mean(baseline);
  const sd = stdDev(baseline);
  // EARS convention: a zero baseline SD is floored at 1 so a jump from a flat
  // zero baseline still raises a score instead of dividing by zero.
  const sigma = sd === 0 ? 1 : sd;
  return { score: (observed - mu) / sigma, expected: mu, sd };
}

/**
 * Reference statistics for the EWMA and CUSUM charts.
 *
 * Both charts must be centred on a baseline that excludes the days under
 * test — if the recent rise is allowed into the baseline it inflates both the
 * mean and the standard deviation, and the chart silently masks the very
 * signal it exists to find. A 2-day guard band is used, matching EARS C2, and
 * is relaxed only when the series is too short to leave one.
 */
function chartBaseline(counts: number[]): { mu: number; sigma: number } | null {
  for (const guard of [2, 1, 0]) {
    const end = counts.length - 1 - guard;
    const start = Math.max(0, end - BASELINE_DAYS);
    const window = end > start ? counts.slice(start, end) : [];
    if (window.length >= 3) return { mu: mean(window), sigma: stdDev(window) || 1 };
  }
  return null;
}

export function earsC1(counts: number[]): DetectorResult {
  const { score, expected } = earsScore(counts, 0);
  return {
    method: 'C1',
    statistic: round(score),
    threshold: EARS_THRESHOLD,
    alarm: score >= EARS_THRESHOLD,
    expected: round(expected),
    detail: '7-day baseline ending yesterday',
  };
}

export function earsC2(counts: number[]): DetectorResult {
  const { score, expected } = earsScore(counts, 2);
  return {
    method: 'C2',
    statistic: round(score),
    threshold: EARS_THRESHOLD,
    alarm: score >= EARS_THRESHOLD,
    expected: round(expected),
    detail: '7-day baseline with a 2-day guard band',
  };
}

/**
 * C3 accumulates the excess of the last three C2 scores, so three consecutive
 * mild days trip an alarm that no single day would.
 */
export function earsC3(counts: number[]): DetectorResult {
  let total = 0;
  let expected = 0;
  for (let lag = 0; lag < 3; lag += 1) {
    const window = counts.slice(0, counts.length - lag);
    const { score, expected: exp } = earsScore(window, 2);
    if (lag === 0) expected = exp;
    total += Math.max(0, score - 1);
  }
  return {
    method: 'C3',
    statistic: round(total),
    threshold: 2,
    alarm: total >= 2,
    expected: round(expected),
    detail: 'Sum of the last three C2 excesses',
  };
}

export interface EwmaOptions {
  lambda?: number;
  L?: number;
}

/** Exponentially weighted moving average control chart. */
export function ewma(counts: number[], options: EwmaOptions = {}): DetectorResult {
  const lambda = options.lambda ?? 0.4;
  const L = options.L ?? 3;
  if (counts.length < 4) {
    return { method: 'EWMA', statistic: 0, threshold: 0, alarm: false, expected: 0, detail: 'Insufficient history' };
  }

  const baseline = chartBaseline(counts);
  if (!baseline) {
    return { method: 'EWMA', statistic: 0, threshold: 0, alarm: false, expected: 0, detail: 'Insufficient history' };
  }
  const { mu, sigma } = baseline;

  let z = mu;
  for (const x of counts) z = lambda * x + (1 - lambda) * z;

  const n = counts.length;
  const limitFactor = Math.sqrt((lambda / (2 - lambda)) * (1 - (1 - lambda) ** (2 * n)));
  const upper = mu + L * sigma * limitFactor;

  return {
    method: 'EWMA',
    statistic: round(z),
    threshold: round(upper),
    alarm: z > upper,
    expected: round(mu),
    detail: `lambda=${lambda}, L=${L}`,
  };
}

export interface CusumOptions {
  /** Reference value in SD units — the shift size the chart is tuned for. */
  k?: number;
  /** Decision interval. */
  h?: number;
}

/** One-sided upward CUSUM on standardised counts. */
export function cusum(counts: number[], options: CusumOptions = {}): DetectorResult {
  const k = options.k ?? 0.5;
  const h = options.h ?? 4;
  if (counts.length < 4) {
    return { method: 'CUSUM', statistic: 0, threshold: h, alarm: false, expected: 0, detail: 'Insufficient history' };
  }

  const baseline = chartBaseline(counts);
  if (!baseline) {
    return { method: 'CUSUM', statistic: 0, threshold: h, alarm: false, expected: 0, detail: 'Insufficient history' };
  }
  const { mu, sigma } = baseline;

  let s = 0;
  for (const x of counts) s = Math.max(0, s + (x - mu) / sigma - k);

  return {
    method: 'CUSUM',
    statistic: round(s),
    threshold: h,
    alarm: s > h,
    expected: round(mu),
    detail: `k=${k}, h=${h}`,
  };
}

export const ABERRATION_SEVERITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type AberrationSeverity = (typeof ABERRATION_SEVERITIES)[number];

export interface AberrationVerdict {
  observed: number;
  expected: number;
  severity: AberrationSeverity;
  alarmingMethods: string[];
  detectors: DetectorResult[];
  /** Ratio of observed to expected, the number an officer actually reads. */
  excessRatio: number;
}

/**
 * Run every detector and grade the result. Severity rises with the number of
 * independent detectors that agree, which suppresses single-detector noise.
 */
export function detectAberration(series: SeriesPoint[]): AberrationVerdict {
  const counts = series.map((p) => p.count);
  const observed = counts[counts.length - 1] ?? 0;

  const detectors = [earsC1(counts), earsC2(counts), earsC3(counts), ewma(counts), cusum(counts)];
  const alarming = detectors.filter((d) => d.alarm);
  const expected = round(mean(detectors.map((d) => d.expected).filter((e) => e > 0)) || 0);

  let severity: AberrationSeverity = 'NONE';
  if (alarming.length >= 3) severity = 'HIGH';
  else if (alarming.length === 2) severity = 'MEDIUM';
  else if (alarming.length === 1) severity = 'LOW';

  return {
    observed,
    expected,
    severity,
    alarmingMethods: alarming.map((d) => d.method),
    detectors,
    excessRatio: expected > 0 ? round(observed / expected) : observed > 0 ? Infinity : 0,
  };
}

function round(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 100) / 100;
}
