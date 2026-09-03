import { useMemo, useState } from 'react';
import { AGE_BANDS, syndromeByCode } from '@mgms/shared';
import type { CountBucket } from '@mgms/shared';
import { useDashboard, useEvents } from '../api/hooks';
import { Card, ErrorBanner, Kpi, Loading, PageHeader } from '../components/common';
import { Pill } from '../components/Pill';
import { BarChart } from '../charts/BarChart';
import { TimeSeriesChart } from '../charts/TimeSeriesChart';
import { GeoMap } from '../charts/GeoMap';
import { SEVERITY_STYLES, STOCK_RISK_STYLES, TRIAGE_STYLES, statusStyle } from '../charts/status';
import { formatDay, relativeTime } from '../charts/scales';

/**
 * The live dashboard.
 *
 * Every widget reads the same filter object and every widget can write to it —
 * clicking a syndrome bar, a map camp or a day on the time series narrows the
 * whole page at once. That coordinated-views behaviour is the point: an officer
 * asks "which camp, which day, which syndrome" by clicking, not by typing.
 */
export function DashboardPage() {
  const { data: events } = useEvents();
  const [eventId, setEventId] = useState<string | undefined>();
  const [campIds, setCampIds] = useState<string[]>([]);
  const [syndromeCodes, setSyndromeCodes] = useState<string[]>([]);
  const [symptomCodes, setSymptomCodes] = useState<string[]>([]);
  const [triageLevels, setTriageLevels] = useState<string[]>([]);
  const [ageBands, setAgeBands] = useState<string[]>([]);
  const [genders, setGenders] = useState<string[]>([]);
  const [day, setDay] = useState<string | null>(null);

  const activeEventId = eventId ?? events?.items.find((e) => e.isActive)?.id ?? events?.items[0]?.id;

  const filter = useMemo(
    () => ({
      eventId: activeEventId,
      campIds,
      syndromeCodes,
      symptomCodes,
      triageLevels,
      ageBands,
      genders,
      from: day ?? undefined,
      to: day ?? undefined,
    }),
    [activeEventId, campIds, syndromeCodes, symptomCodes, triageLevels, ageBands, genders, day],
  );

  const { data, isLoading, error, isFetching, dataUpdatedAt } = useDashboard(filter);

  const toggle = (list: string[], setList: (next: string[]) => void) => (key: string) =>
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const activeFilters =
    campIds.length + syndromeCodes.length + symptomCodes.length + triageLevels.length + ageBands.length + genders.length + (day ? 1 : 0);

  function clearAll() {
    setCampIds([]);
    setSyndromeCodes([]);
    setSymptomCodes([]);
    setTriageLevels([]);
    setAgeBands([]);
    setGenders([]);
    setDay(null);
  }

  if (error) return <ErrorBanner error={error} />;
  if (isLoading || !data) return <Loading label="Loading the live picture…" />;

  const { kpis } = data;
  const campNameById = new Map(data.camps.map((c) => [c.campId, c.campName]));
  const syndromeLabels: Record<string, string> = Object.fromEntries(
    data.bySyndrome.map((b) => [b.key, b.label]),
  );
  syndromeLabels.UNCLASSIFIED = 'Unclassified';

  // Age bands are an ordered dimension, so they keep their natural order
  // rather than being sorted by size like the nominal breakdowns.
  const orderedAgeBands: CountBucket[] = AGE_BANDS.map((band) => {
    const found = data.byAgeBand.find((b) => b.key === band.code);
    return { key: band.code, label: band.label, count: found?.count ?? 0 };
  });

  const unacknowledged = data.signals.length;

  return (
    <>
      <PageHeader
        title="Live dashboard"
        subtitle={`${data.camps.length} camps · updated ${relativeTime(new Date(dataUpdatedAt).toISOString())}${isFetching ? ' · refreshing' : ''}`}
        action={
          <select
            className="select"
            value={activeEventId ?? ''}
            onChange={(e) => {
              setEventId(e.target.value);
              clearAll();
            }}
            aria-label="Gathering"
          >
            {events?.items.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        }
      />

      {/* Filters live in one row above the charts. */}
      <div className="row" style={{ gap: 6 }}>
        <span className="tiny muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Filter
        </span>
        {day && (
          <button className="chip on" type="button" onClick={() => setDay(null)}>
            {formatDay(day)} ✕
          </button>
        )}
        {campIds.map((id) => (
          <button className="chip on" type="button" key={id} onClick={() => setCampIds(campIds.filter((c) => c !== id))}>
            {campNameById.get(id) ?? 'Camp'} ✕
          </button>
        ))}
        {syndromeCodes.map((code) => (
          <button className="chip on" type="button" key={code} onClick={() => toggle(syndromeCodes, setSyndromeCodes)(code)}>
            {syndromeByCode(code)?.name ?? code} ✕
          </button>
        ))}
        {[...symptomCodes, ...triageLevels, ...ageBands, ...genders].length > 0 && (
          <span className="tiny muted">+{symptomCodes.length + triageLevels.length + ageBands.length + genders.length} more</span>
        )}
        {activeFilters > 0 ? (
          <button className="btn btn-sm" type="button" onClick={clearAll}>
            Clear all
          </button>
        ) : (
          <span className="tiny muted">Click any bar, day or camp to narrow every panel.</span>
        )}
      </div>

      <div className="grid grid-kpi">
        <Kpi label="Walk-ins today" value={kpis.todayWalkIns.toLocaleString()} note={`${kpis.totalWalkIns.toLocaleString()} this gathering`} />
        <Kpi label="Waiting to be seen" value={kpis.waiting.toLocaleString()} note={kpis.medianMinutesToClinical != null ? `median ${kpis.medianMinutesToClinical} min to MO` : 'no clinical records yet'} />
        <Kpi
          label="Critical open"
          value={kpis.criticalOpen.toLocaleString()}
          note={<span style={{ color: kpis.criticalOpen > 0 ? 'var(--status-critical)' : undefined }}>{kpis.criticalOpen > 0 ? '● needs coordination' : '■ none open'}</span>}
        />
        <Kpi label="Referrals" value={kpis.referrals.toLocaleString()} note="to empanelled hospitals" />
        <Kpi label="Camps open" value={`${kpis.campsActive}/${kpis.campsTotal}`} note={`${kpis.staffOnDuty} staff on duty`} />
        <Kpi
          label="Data freshness"
          value={kpis.syncLagMinutes == null ? '—' : `${kpis.syncLagMinutes} min`}
          note="since last camp sync"
        />
      </div>

      <Card
        title="Case load over time"
        subtitle="Daily walk-ins by syndrome. Click a day to pin the whole dashboard to it."
      >
        <TimeSeriesChart
          points={data.timeSeries}
          seriesLabels={syndromeLabels}
          onSelectDay={(selected) => setDay(day === selected ? null : selected)}
          selectedDay={day}
        />
      </Card>

      <div className="grid grid-2">
        <Card title="Where cases are coming from" subtitle="Circle area is walk-in count by village of residence; squares are camps.">
          <GeoMap
            geo={data.geo}
            camps={data.camps}
            clusters={data.clusters}
            onSelectCamp={(id) => setCampIds(campIds.includes(id) ? campIds.filter((c) => c !== id) : [...campIds, id])}
            selectedCampIds={campIds}
          />
        </Card>

        <Card
          title="Surveillance signals"
          subtitle={unacknowledged > 0 ? `${unacknowledged} syndrome-scope combinations above their baseline` : 'Nothing above baseline'}
        >
          {data.signals.length === 0 ? (
            <div className="empty">No aberration detected in the current window.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
              {data.signals.slice(0, 10).map((signal) => {
                const severity = signal.verdict.severity === 'HIGH' ? 'CRITICAL' : 'WARNING';
                return (
                  <div key={`${signal.scopeType}-${signal.scopeId}-${signal.syndromeCode}`} className="alert-item" style={{ paddingTop: 0 }}>
                    <div className="alert-bar" style={{ background: statusStyle(SEVERITY_STYLES, severity).color }} />
                    <div style={{ minWidth: 0 }}>
                      <div className="alert-title">
                        {signal.syndromeName} · {signal.scopeName}
                      </div>
                      <div className="alert-body">
                        <strong className="mono">{signal.verdict.observed}</strong> observed against{' '}
                        <strong className="mono">{signal.verdict.expected}</strong> expected
                        {Number.isFinite(signal.verdict.excessRatio) && ` (${signal.verdict.excessRatio}×)`}.
                      </div>
                      <div className="tiny muted" style={{ marginTop: 3 }}>
                        Flagged by {signal.verdict.alarmingMethods.join(', ')} ·{' '}
                        {signal.scopeType === 'CAMP' ? 'camp' : 'district'} level
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      <Pill style={statusStyle(SEVERITY_STYLES, severity)} text={signal.verdict.severity} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Syndrome" subtitle="IDSP classification of the presenting complaint">
          <BarChart
            buckets={data.bySyndrome}
            selected={syndromeCodes}
            onToggle={toggle(syndromeCodes, setSyndromeCodes)}
          />
        </Card>

        <Card title="Reported symptoms" subtitle="A walk-in may report several">
          <BarChart
            buckets={data.bySymptom}
            selected={symptomCodes}
            onToggle={toggle(symptomCodes, setSymptomCodes)}
          />
        </Card>

        <Card title="Triage" subtitle="Colour is reinforced by shape and label">
          <BarChart
            buckets={data.byTriage}
            colorFor={(bucket) => statusStyle(TRIAGE_STYLES, bucket.key).color}
            glyphFor={(bucket) => statusStyle(TRIAGE_STYLES, bucket.key).glyph}
            selected={triageLevels}
            onToggle={toggle(triageLevels, setTriageLevels)}
          />
        </Card>

        <Card title="Age band" subtitle="Ordered dimension, not ranked by size">
          <BarChart buckets={orderedAgeBands} selected={ageBands} onToggle={toggle(ageBands, setAgeBands)} limit={AGE_BANDS.length} />
        </Card>

        <Card title="Gender" subtitle="Self-reported at registration">
          <BarChart buckets={data.byGender} selected={genders} onToggle={toggle(genders, setGenders)} />
        </Card>

        <Card title="Place of onset" subtitle="Where symptoms began">
          <BarChart buckets={data.byOnsetPlace} />
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Camp status" subtitle="Live queue, staffing and readiness">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Camp</th>
                  <th className="num">Today</th>
                  <th className="num">Waiting</th>
                  <th className="num">Critical</th>
                  <th className="num">Staff</th>
                  <th className="num">Ready</th>
                  <th>Last sync</th>
                </tr>
              </thead>
              <tbody>
                {data.camps.map((camp) => (
                  <tr
                    key={camp.campId}
                    onClick={() => setCampIds(campIds.includes(camp.campId) ? campIds.filter((c) => c !== camp.campId) : [...campIds, camp.campId])}
                    style={{ cursor: 'pointer', fontWeight: campIds.includes(camp.campId) ? 600 : 400 }}
                  >
                    <td className="nowrap">{camp.campName}</td>
                    <td className="num mono">{camp.walkInsToday}</td>
                    <td className="num mono">{camp.waiting}</td>
                    <td className="num mono" style={{ color: camp.criticalOpen > 0 ? 'var(--status-critical)' : undefined }}>
                      {camp.criticalOpen > 0 ? `● ${camp.criticalOpen}` : '0'}
                    </td>
                    <td className="num mono">{camp.staffOnDuty}</td>
                    <td className="num mono">{camp.readinessPercent == null ? '—' : `${camp.readinessPercent}%`}</td>
                    <td className="small muted">{relativeTime(camp.lastSyncAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Drug supply at risk" subtitle="Projected from each camp's own consumption trend">
          {data.stock.length === 0 ? (
            <div className="empty">Every camp holds adequate stock.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Drug</th>
                    <th>Camp</th>
                    <th>Status</th>
                    <th className="num">On hand</th>
                    <th className="num">Days left</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stock.slice(0, 12).map((row) => (
                    <tr key={`${row.campId}-${row.drugCode}`}>
                      <td className="nowrap">{row.drugName}</td>
                      <td className="small muted nowrap">{row.campName}</td>
                      <td className="nowrap">
                        <Pill style={statusStyle(STOCK_RISK_STYLES, row.risk)} />
                      </td>
                      <td className="num mono">{row.onHand}</td>
                      <td
                        className="num mono"
                        title={`Burning about ${row.projectedDailyBurn} units per day`}
                      >
                        {row.daysToStockout ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {data.clusters.length > 0 && (
        <Card title="Spatial clusters" subtitle="Kulldorff scan over festival zones — the window with the highest excess risk">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Centre</th>
                  <th className="num">Zones</th>
                  <th className="num">Radius</th>
                  <th className="num">Observed</th>
                  <th className="num">Expected</th>
                  <th className="num">Relative risk</th>
                  <th className="num">Log-likelihood</th>
                </tr>
              </thead>
              <tbody>
                {data.clusters.map((cluster) => (
                  <tr key={cluster.centreId}>
                    <td className="nowrap">{cluster.centreName}</td>
                    <td className="num mono">{cluster.areaIds.length}</td>
                    <td className="num mono">
                      {cluster.radiusKm > 0 ? `${cluster.radiusKm} km` : 'single zone'}
                    </td>
                    <td className="num mono">{cluster.observed}</td>
                    <td className="num mono">{cluster.expected}</td>
                    <td className="num mono" style={{ fontWeight: cluster.relativeRisk >= 1.5 ? 600 : 400 }}>
                      {cluster.relativeRisk}×
                    </td>
                    <td className="num mono">{cluster.logLikelihoodRatio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
