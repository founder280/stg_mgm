/**
 * The reserved status palette.
 *
 * Every status colour ships with a glyph and a label, because two of these
 * steps sit below 3:1 on the light surface by design — colour is a reinforcing
 * cue here, never the carrier of meaning.
 */

export interface StatusStyle {
  color: string;
  glyph: string;
  label: string;
}

export const TRIAGE_STYLES: Record<string, StatusStyle> = {
  RED: { color: 'var(--status-critical)', glyph: '●', label: 'Red — immediate' },
  ORANGE: { color: 'var(--status-serious)', glyph: '◆', label: 'Orange — very urgent' },
  YELLOW: { color: 'var(--status-warning)', glyph: '▲', label: 'Yellow — urgent' },
  GREEN: { color: 'var(--status-good)', glyph: '■', label: 'Green — standard' },
};

export const SEVERITY_STYLES: Record<string, StatusStyle> = {
  CRITICAL: { color: 'var(--status-critical)', glyph: '●', label: 'Critical' },
  WARNING: { color: 'var(--status-warning)', glyph: '▲', label: 'Warning' },
  INFO: { color: 'var(--status-good)', glyph: '■', label: 'Information' },
};

export const STOCK_RISK_STYLES: Record<string, StatusStyle> = {
  OUT_OF_STOCK: { color: 'var(--status-critical)', glyph: '●', label: 'Out of stock' },
  STOCKOUT_IMMINENT: { color: 'var(--status-critical)', glyph: '●', label: 'Stockout imminent' },
  LOW: { color: 'var(--status-serious)', glyph: '◆', label: 'Below reorder level' },
  WATCH: { color: 'var(--status-warning)', glyph: '▲', label: 'Watch' },
  OK: { color: 'var(--status-good)', glyph: '■', label: 'Adequate' },
};

export const STAGE_LABELS: Record<string, string> = {
  REGISTERED: 'Registered',
  VITALS_DONE: 'Vitals done',
  CLINICAL_DONE: 'Seen by MO',
  DISPENSED: 'Dispensed',
  REFERRED: 'Referred',
  CLOSED: 'Closed',
};

export function statusStyle(map: Record<string, StatusStyle>, key: string): StatusStyle {
  return map[key] ?? { color: 'var(--text-muted)', glyph: '·', label: key };
}
