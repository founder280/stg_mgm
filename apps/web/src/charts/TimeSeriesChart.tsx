import { useMemo, useRef, useState } from 'react';
import type { TimeSeriesPoint } from '@mgms/shared';
import { Tooltip, type TooltipState } from './Tooltip';
import { MAX_SERIES, OTHER_COLOR, SERIES_COLORS, formatCount, formatDay, linearScale, niceMax, ticks } from './scales';

interface Props {
  points: TimeSeriesPoint[];
  /** Human labels for the series keys inside each point. */
  seriesLabels: Record<string, string>;
  height?: number;
  /** Called when a day is clicked, to drive the coordinated filter. */
  onSelectDay?: (date: string) => void;
  selectedDay?: string | null;
}

interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
  total: number;
}

/**
 * Daily case counts, split by syndrome.
 *
 * The five largest syndromes take the categorical slots in fixed order and
 * everything else folds into "Other" — hues are never generated or cycled, and
 * because a series keeps its slot across filter changes, a reader who learned
 * "diarrhoeal disease is blue" is not misled when the filter narrows.
 */
export function TimeSeriesChart({ points, seriesLabels, height = 220, onSelectDay, selectedDay }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const series = useMemo<Series[]>(() => {
    const totals = new Map<string, number>();
    for (const point of points) {
      for (const [key, value] of Object.entries(point.series ?? {})) {
        totals.set(key, (totals.get(key) ?? 0) + value);
      }
    }

    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, MAX_SERIES).map(([key]) => key);
    const rest = new Set(ranked.slice(MAX_SERIES).map(([key]) => key));

    const built: Series[] = top.map((key, index) => ({
      key,
      label: seriesLabels[key] ?? key,
      color: SERIES_COLORS[index] ?? OTHER_COLOR,
      values: points.map((p) => p.series?.[key] ?? 0),
      total: totals.get(key) ?? 0,
    }));

    if (rest.size > 0) {
      built.push({
        key: '__other',
        label: `Other (${rest.size})`,
        color: OTHER_COLOR,
        values: points.map((p) =>
          Object.entries(p.series ?? {}).reduce((sum, [k, v]) => (rest.has(k) ? sum + v : sum), 0),
        ),
        total: ranked.slice(MAX_SERIES).reduce((sum, [, v]) => sum + v, 0),
      });
    }

    return built;
  }, [points, seriesLabels]);

  const visible = series.filter((s) => !hidden.has(s.key));

  const pad = { top: 12, right: 16, bottom: 24, left: 38 };
  const width = 720;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxValue = niceMax(Math.max(1, ...visible.flatMap((s) => s.values)));
  const y = linearScale([0, maxValue], [pad.top + innerH, pad.top]);
  const x = (index: number) =>
    pad.left + (points.length <= 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);

  const yTicks = ticks(maxValue);
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleMove(event: React.MouseEvent<SVGRectElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return;

    const relative = ((event.clientX - rect.left) / rect.width) * width;
    const step = points.length <= 1 ? innerW : innerW / (points.length - 1);
    const index = Math.max(0, Math.min(points.length - 1, Math.round((relative - pad.left) / step)));
    const point = points[index];
    if (!point) return;

    setHoverIndex(index);
    setTooltip({
      x: event.clientX,
      y: event.clientY,
      content: (
        <>
          <div className="tooltip-title">{formatDay(point.date)}</div>
          {visible.map((s) => (
            <div className="tooltip-row" key={s.key}>
              <span className="k">
                <span className="legend-swatch" style={{ background: s.color }} aria-hidden />
                {s.label}
              </span>
              <span className="mono">{s.values[index] ?? 0}</span>
            </div>
          ))}
          <div className="tooltip-row" style={{ marginTop: 3, fontWeight: 600 }}>
            <span className="k">Total</span>
            <span className="mono">{point.count}</span>
          </div>
        </>
      ),
    });
  }

  if (showTable) {
    return (
      <>
        <TableToggle showTable={showTable} onToggle={() => setShowTable(false)} />
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Day</th>
                {series.map((s) => (
                  <th className="num" key={s.key}>{s.label}</th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point, index) => (
                <tr key={point.date}>
                  <td>{formatDay(point.date)}</td>
                  {series.map((s) => (
                    <td className="num mono" key={s.key}>{s.values[index] ?? 0}</td>
                  ))}
                  <td className="num mono">{point.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <>
      <TableToggle showTable={showTable} onToggle={() => setShowTable(true)} />

      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Daily walk-in counts by syndrome over ${points.length} days`}
        onMouseLeave={() => {
          setTooltip(null);
          setHoverIndex(null);
        }}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line className="grid-line" x1={pad.left} x2={pad.left + innerW} y1={y(tick)} y2={y(tick)} />
            <text className="axis-label" x={pad.left - 6} y={y(tick) + 3} textAnchor="end">
              {formatCount(tick)}
            </text>
          </g>
        ))}

        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text className="axis-label" key={point.date} x={x(index)} y={height - 8} textAnchor="middle">
              {formatDay(point.date)}
            </text>
          ) : null,
        )}

        {hoverIndex !== null && (
          <line className="axis-line" x1={x(hoverIndex)} x2={x(hoverIndex)} y1={pad.top} y2={pad.top + innerH} />
        )}
        {selectedDay && points.findIndex((p) => p.date === selectedDay) >= 0 && (
          <line
            x1={x(points.findIndex((p) => p.date === selectedDay))}
            x2={x(points.findIndex((p) => p.date === selectedDay))}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="var(--series-1)"
            strokeWidth={2}
          />
        )}

        {visible.map((s) => (
          <path
            key={s.key}
            d={s.values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(value)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Direct label on the endpoint of the largest series only — a value on
            every point would be unreadable, and the tooltip carries the rest. */}
        {visible[0] && points.length > 0 && (
          <text
            x={x(points.length - 1) - 4}
            y={y(visible[0].values[points.length - 1] ?? 0) - 8}
            textAnchor="end"
            style={{ fontSize: 11, fontWeight: 600, fill: 'var(--text-secondary)' }}
          >
            {visible[0].label}
          </text>
        )}

        {hoverIndex !== null &&
          visible.map((s) => (
            <circle
              key={s.key}
              cx={x(hoverIndex)}
              cy={y(s.values[hoverIndex] ?? 0)}
              r={4}
              fill={s.color}
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          ))}

        <line className="axis-line" x1={pad.left} x2={pad.left + innerW} y1={pad.top + innerH} y2={pad.top + innerH} />

        <rect
          x={pad.left}
          y={pad.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          style={{ cursor: onSelectDay ? 'pointer' : 'crosshair' }}
          onMouseMove={handleMove}
          onClick={() => {
            if (onSelectDay && hoverIndex !== null) {
              const point = points[hoverIndex];
              if (point) onSelectDay(point.date);
            }
          }}
        />
      </svg>

      <div className="legend" style={{ marginTop: 8 }}>
        {series.map((s) => (
          <button
            type="button"
            key={s.key}
            className={`legend-item ${hidden.has(s.key) ? 'off' : ''}`}
            onClick={() => toggle(s.key)}
            style={{ background: 'none', border: 'none', padding: 0 }}
            aria-pressed={!hidden.has(s.key)}
          >
            <span className="legend-swatch" style={{ background: s.color }} aria-hidden />
            {s.label}
            <span className="mono muted">{s.total}</span>
          </button>
        ))}
      </div>

      <Tooltip state={tooltip} />
    </>
  );
}

function TableToggle({ showTable, onToggle }: { showTable: boolean; onToggle: () => void }) {
  return (
    <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 4 }}>
      <button type="button" className="btn btn-sm" onClick={onToggle}>
        {showTable ? 'Show chart' : 'Show table'}
      </button>
    </div>
  );
}
