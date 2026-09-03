/** Minimal scale and tick helpers — enough for the chart set, no chart library. */

export interface LinearScale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as LinearScale;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

/** "Nice" tick values — at most `count`, on 1/2/5×10ⁿ steps. */
export function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = (normalised >= 5 ? 5 : normalised >= 2 ? 2 : 1) * magnitude;

  const out: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) out.push(Math.round(value * 1000) / 1000);
  return out;
}

/** Round a maximum up to the next tick so the top gridline is the frame. */
export function niceMax(max: number, count = 4): number {
  const list = ticks(max, count);
  const last = list[list.length - 1] ?? 0;
  return last >= max ? last : max;
}

export function formatCount(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value * 100) / 100);
}

/** "14 Jan" — short enough for an axis at this density. */
export function formatDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** The categorical slots, in fixed order. Never cycled: a 6th series is "Other". */
export const SERIES_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
] as const;

export const OTHER_COLOR = 'var(--series-other)';

export const MAX_SERIES = SERIES_COLORS.length;

/** The single-hue magnitude ramp for the map. */
export const SEQUENTIAL_RAMP = [
  'var(--seq-100)',
  'var(--seq-200)',
  'var(--seq-300)',
  'var(--seq-400)',
  'var(--seq-500)',
  'var(--seq-600)',
  'var(--seq-700)',
] as const;

export function rampStep(value: number, max: number): string {
  if (max <= 0) return SEQUENTIAL_RAMP[0];
  const index = Math.min(
    SEQUENTIAL_RAMP.length - 1,
    Math.floor((value / max) * SEQUENTIAL_RAMP.length),
  );
  return SEQUENTIAL_RAMP[index] ?? SEQUENTIAL_RAMP[0];
}
