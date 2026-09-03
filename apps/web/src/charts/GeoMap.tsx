import { useMemo, useRef, useState } from 'react';
import { geoMercator } from 'd3-geo';
import type { CampStatus, GeoFeatureCount, ScanCluster } from '@mgms/shared';
import { Tooltip, type TooltipState } from './Tooltip';
import { SEQUENTIAL_RAMP, rampStep, relativeTime } from './scales';

interface Props {
  geo: GeoFeatureCount[];
  camps: CampStatus[];
  clusters?: ScanCluster[];
  height?: number;
  onSelectCamp?: (campId: string) => void;
  selectedCampIds?: string[];
}

interface Placed<T> {
  item: T;
  x: number;
  y: number;
}

/**
 * The GIS view.
 *
 * Rendered as a projected vector scene rather than a tile map: a public-health
 * deployment usually sits behind a firewall with no route to a tile CDN, and a
 * map that silently renders blank in the control room is worse than no map.
 * Everything here draws from the API's own coordinates.
 *
 * Two encodings share the plane and are kept visually distinct:
 *   - residence case load  — circles, area ∝ count, filled from a single-hue
 *     magnitude ramp with a scale legend;
 *   - camps                — squares, so a camp is never mistaken for a case
 *     cluster, carrying their own operational status.
 */
export function GeoMap({ geo, camps, clusters = [], height = 420, onSelectCamp, selectedCampIds = [] }: Props) {
  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 760;

  const points = useMemo(
    () => [
      ...geo.filter((g) => g.latitude != null && g.longitude != null).map((g) => ({ lon: g.longitude!, lat: g.latitude! })),
      ...camps.filter((c) => c.latitude != null && c.longitude != null).map((c) => ({ lon: c.longitude!, lat: c.latitude! })),
    ],
    [geo, camps],
  );

  const projection = useMemo(() => {
    const proj = geoMercator();
    if (points.length === 0) return proj.center([79.07, 12.22]).scale(20000).translate([width / 2, height / 2]);

    const lons = points.map((p) => p.lon);
    const lats = points.map((p) => p.lat);
    // A single point has no extent to fit, so pad the box before fitting.
    const padDeg = 0.02;
    const feature = {
      type: 'MultiPoint' as const,
      coordinates: [
        [Math.min(...lons) - padDeg, Math.min(...lats) - padDeg],
        [Math.max(...lons) + padDeg, Math.max(...lats) + padDeg],
      ],
    };
    return proj.fitExtent(
      [
        // Extra top padding so a label above the highest circle is not clipped.
        [30, 34],
        [width - 30, height - 30],
      ],
      feature,
    );
  }, [points, height]);

  const maxCases = Math.max(1, ...geo.map((g) => g.count));
  const maxRadius = 22;

  const placedGeo: Placed<GeoFeatureCount>[] = geo
    .filter((g) => g.latitude != null && g.longitude != null)
    .map((g) => {
      const xy = projection([g.longitude!, g.latitude!]);
      return xy ? { item: g, x: xy[0], y: xy[1] } : null;
    })
    .filter((p): p is Placed<GeoFeatureCount> => p !== null);

  const placedCamps: Placed<CampStatus>[] = camps
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => {
      const xy = projection([c.longitude!, c.latitude!]);
      return xy ? { item: c, x: xy[0], y: xy[1] } : null;
    })
    .filter((p): p is Placed<CampStatus> => p !== null);

  function zoomBy(factor: number) {
    setTransform((t) => ({ ...t, k: Math.min(8, Math.max(1, t.k * factor)) }));
  }

  function onWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    dragOrigin.current = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const origin = dragOrigin.current;
    if (!origin) return;
    setTransform((t) => ({
      ...t,
      x: origin.tx + (event.clientX - origin.x),
      y: origin.ty + (event.clientY - origin.y),
    }));
  }

  function endDrag(event: React.PointerEvent<SVGSVGElement>) {
    dragOrigin.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  /**
   * Label the heaviest villages, skipping any whose label would collide with
   * one already placed. Labelling every circle turns a dense sector into an
   * unreadable stack, and labelling none makes the map hover-only.
   */
  const labelled = useMemo(() => {
    const placed: Placed<GeoFeatureCount>[] = [];
    const candidates = [...placedGeo].sort((a, b) => b.item.count - a.item.count).slice(0, 12);
    for (const candidate of candidates) {
      if (placed.length >= 5) break;
      const collides = placed.some(
        (other) => Math.abs(other.x - candidate.x) < 84 && Math.abs(other.y - candidate.y) < 18,
      );
      if (!collides) placed.push(candidate);
    }
    return placed;
  }, [placedGeo]);

  // Marks keep a constant screen size as the view zooms, so a dense cluster
  // separates instead of the symbols growing with it.
  const inv = 1 / transform.k;

  return (
    <div className="map-frame">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={dragging ? 'dragging' : ''}
        role="img"
        aria-label={`Map of ${camps.length} camps and case load across ${geo.length} villages`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={(e) => {
          endDrag(e);
          setTooltip(null);
        }}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* Cluster windows sit under everything: they are context, not a mark. */}
          {clusters.map((cluster) => {
            const xy = projection([cluster.centreLongitude, cluster.centreLatitude]);
            if (!xy) return null;
            return (
              <circle
                key={cluster.centreId}
                cx={xy[0]}
                cy={xy[1]}
                // A single-zone window has no radius, so it still gets a
                // minimum ring — otherwise the strongest cluster is invisible.
                r={Math.max(26, Math.min(140, cluster.radiusKm * 14))}
                fill="var(--status-critical)"
                fillOpacity={0.06}
                stroke="var(--status-critical)"
                strokeOpacity={0.5}
                strokeWidth={2 * inv}
              />
            );
          })}

          {placedGeo.map(({ item, x, y }) => {
            const r = Math.max(4, Math.sqrt(item.count / maxCases) * maxRadius);
            return (
              <circle
                key={item.id}
                cx={x}
                cy={y}
                r={r * inv}
                fill={rampStep(item.count, maxCases)}
                fillOpacity={0.85}
                stroke="var(--surface-1)"
                strokeWidth={2 * inv}
                onMouseMove={(event) =>
                  setTooltip({
                    x: event.clientX,
                    y: event.clientY,
                    content: (
                      <>
                        <div className="tooltip-title">{item.name}</div>
                        <div className="tooltip-row">
                          <span className="k">Walk-ins from here</span>
                          <span className="mono">{item.count}</span>
                        </div>
                        {item.rate != null && (
                          <div className="tooltip-row">
                            <span className="k">Per 1,000 residents</span>
                            <span className="mono">{item.rate}</span>
                          </div>
                        )}
                      </>
                    ),
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}

          {labelled.map(({ item, x, y }) => {
              const r = Math.max(4, Math.sqrt(item.count / maxCases) * maxRadius);
              return (
                <text
                  key={`label-${item.id}`}
                  x={x}
                  y={y - (r + 5) * inv}
                  textAnchor="middle"
                  style={{
                    fontSize: 10 * inv,
                    fontWeight: 600,
                    fill: 'var(--text-secondary)',
                    paintOrder: 'stroke',
                    stroke: 'var(--surface-2)',
                    strokeWidth: 3 * inv,
                  }}
                >
                  {item.name}
                </text>
              );
          })}

          {placedCamps.map(({ item, x, y }) => {
            const size = 11 * inv;
            const isSelected = selectedCampIds.includes(item.campId);
            const status =
              item.criticalOpen > 0
                ? 'var(--status-critical)'
                : item.stockAlerts > 0 || (item.readinessPercent ?? 100) < 90
                  ? 'var(--status-warning)'
                  : 'var(--status-good)';
            return (
              <g key={item.campId} style={{ cursor: onSelectCamp ? 'pointer' : 'default' }}>
                <rect
                  x={x - size / 2}
                  y={y - size / 2}
                  width={size}
                  height={size}
                  rx={2 * inv}
                  fill={status}
                  stroke={isSelected ? 'var(--text-primary)' : 'var(--surface-1)'}
                  strokeWidth={(isSelected ? 3 : 2) * inv}
                  onClick={() => onSelectCamp?.(item.campId)}
                  onMouseMove={(event) =>
                    setTooltip({
                      x: event.clientX,
                      y: event.clientY,
                      content: (
                        <>
                          <div className="tooltip-title">{item.campName}</div>
                          <div className="tiny muted" style={{ marginBottom: 3 }}>{item.districtName} district</div>
                          <div className="tooltip-row">
                            <span className="k">Walk-ins today</span>
                            <span className="mono">{item.walkInsToday}</span>
                          </div>
                          <div className="tooltip-row">
                            <span className="k">Waiting</span>
                            <span className="mono">{item.waiting}</span>
                          </div>
                          <div className="tooltip-row">
                            <span className="k">Critical open</span>
                            <span className="mono">{item.criticalOpen}</span>
                          </div>
                          <div className="tooltip-row">
                            <span className="k">Staff on duty</span>
                            <span className="mono">{item.staffOnDuty}</span>
                          </div>
                          <div className="tooltip-row">
                            <span className="k">Last sync</span>
                            <span className="mono">{relativeTime(item.lastSyncAt)}</span>
                          </div>
                        </>
                      ),
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                />
              </g>
            );
          })}
        </g>
      </svg>

      <div className="map-controls">
        <button type="button" className="btn btn-sm" onClick={() => zoomBy(1.4)} aria-label="Zoom in">+</button>
        <button type="button" className="btn btn-sm" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">−</button>
        <button type="button" className="btn btn-sm" onClick={() => setTransform({ k: 1, x: 0, y: 0 })} aria-label="Reset view">⤢</button>
      </div>

      <div
        className="row"
        style={{ position: 'absolute', left: 10, bottom: 8, gap: 14, background: 'var(--surface-1)', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)' }}
      >
        <span className="map-scale">
          <span>Cases</span>
          <span className="steps">
            {SEQUENTIAL_RAMP.map((color) => (
              <i key={color} style={{ background: color }} />
            ))}
          </span>
          <span className="mono">{maxCases}</span>
        </span>
        <span className="map-scale">
          <svg width="10" height="10" aria-hidden>
            <rect width="10" height="10" rx="2" fill="var(--status-good)" />
          </svg>
          <span>Camp</span>
        </span>
      </div>

      <Tooltip state={tooltip} />
    </div>
  );
}
