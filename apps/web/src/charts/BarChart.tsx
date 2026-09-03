import { useState } from 'react';
import type { CountBucket } from '@mgms/shared';
import { Tooltip, type TooltipState } from './Tooltip';

interface Props {
  buckets: CountBucket[];
  /** Bars are one series, so one colour; a status role overrides per bar. */
  colorFor?: (bucket: CountBucket) => string;
  glyphFor?: (bucket: CountBucket) => string | null;
  max?: number;
  limit?: number;
  selected?: string[];
  onToggle?: (key: string) => void;
  total?: number;
}

/**
 * Horizontal bars for a categorical breakdown.
 *
 * One series means one colour — shading each bar darker-where-bigger would
 * double-encode the length that is already the whole point of the chart.
 */
export function BarChart({ buckets, colorFor, glyphFor, max, limit = 8, selected = [], onToggle, total }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const shown = buckets.slice(0, limit);
  const ceiling = max ?? Math.max(1, ...shown.map((b) => b.count));
  const sum = total ?? buckets.reduce((acc, b) => acc + b.count, 0);

  if (shown.length === 0) {
    return <div className="empty">No records match the current filter.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {shown.map((bucket) => {
        const isSelected = selected.includes(bucket.key);
        const width = Math.max(1, (bucket.count / ceiling) * 100);
        const color = colorFor?.(bucket) ?? 'var(--series-1)';
        const glyph = glyphFor?.(bucket) ?? null;
        const share = sum > 0 ? Math.round((bucket.count / sum) * 100) : 0;

        const Row = onToggle ? 'button' : 'div';
        return (
          <Row
            key={bucket.key}
            type={onToggle ? 'button' : undefined}
            onClick={onToggle ? () => onToggle(bucket.key) : undefined}
            aria-pressed={onToggle ? isSelected : undefined}
            className="bar-row"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 46px',
              gap: 8,
              alignItems: 'center',
              background: 'none',
              border: 'none',
              padding: '2px 0',
              textAlign: 'left',
              width: '100%',
              cursor: onToggle ? 'pointer' : 'default',
              opacity: selected.length > 0 && !isSelected ? 0.45 : 1,
              font: 'inherit',
              color: 'inherit',
            }}
            onMouseMove={(event: React.MouseEvent) =>
              setTooltip({
                x: event.clientX,
                y: event.clientY,
                content: (
                  <>
                    <div className="tooltip-title">{bucket.label}</div>
                    <div className="tooltip-row">
                      <span className="k">Walk-ins</span>
                      <span className="mono">{bucket.count.toLocaleString()}</span>
                    </div>
                    <div className="tooltip-row">
                      <span className="k">Share</span>
                      <span className="mono">{share}%</span>
                    </div>
                    {onToggle && <div className="tiny muted" style={{ marginTop: 3 }}>Click to filter</div>}
                  </>
                ),
              })
            }
            onMouseLeave={() => setTooltip(null)}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, marginBottom: 2 }}>
                {glyph && <span aria-hidden style={{ color, fontSize: 10 }}>{glyph}</span>}
                <span style={{ fontWeight: isSelected ? 600 : 400 }}>{bucket.label}</span>
              </div>
              <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4 }}>
                <div
                  style={{
                    width: `${width}%`,
                    height: '100%',
                    background: color,
                    // Rounded data-end, square against the baseline.
                    borderRadius: '0 4px 4px 0',
                  }}
                />
              </div>
            </div>
            <div className="mono small" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
              {bucket.count.toLocaleString()}
            </div>
          </Row>
        );
      })}

      {buckets.length > limit && (
        <div className="tiny muted" style={{ marginTop: 2 }}>
          {buckets.length - limit} more not shown
        </div>
      )}

      <Tooltip state={tooltip} />
    </div>
  );
}
