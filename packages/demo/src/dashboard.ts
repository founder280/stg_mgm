import {
  AGE_BANDS,
  SYMPTOMS,
  detectAberration,
  projectStock,
  scanClusters,
  syndromeByCode,
  type CampStatus,
  type CountBucket,
  type DashboardFilter,
  type DashboardSnapshot,
  type GeoFeatureCount,
  type ScanArea,
  type SeriesPoint,
  type SyndromeSignal,
  type TimeSeriesPoint,
  type UserScope,
} from '@mgms/shared';
import { addressById, campById, snapshot, state, visibleCamps, visibleWalkIns, type DemoWalkIn } from './store.js';

const DAY_MS = 86_400_000;
const dayKey = (value: string | Date) => new Date(value).toISOString().slice(0, 10);

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/**
 * Apply the dashboard filter to the walk-ins the user may see.
 *
 * Scope is applied first and the filter second, so — as on the server — a
 * filter can narrow what a user sees but never widen it.
 */
export function filterWalkIns(filter: DashboardFilter, scope: UserScope): DemoWalkIn[] {
  let rows = visibleWalkIns(scope);

  if (filter.campIds?.length) rows = rows.filter((w) => filter.campIds!.includes(w.campId));
  if (filter.districtIds?.length) rows = rows.filter((w) => filter.districtIds!.includes(w.districtId));
  if (filter.zoneIds?.length) rows = rows.filter((w) => w.onsetZoneId && filter.zoneIds!.includes(w.onsetZoneId));
  if (filter.syndromeCodes?.length) rows = rows.filter((w) => w.primarySyndromeCode && filter.syndromeCodes!.includes(w.primarySyndromeCode));
  if (filter.genders?.length) rows = rows.filter((w) => filter.genders!.includes(w.gender));
  if (filter.ageBands?.length) rows = rows.filter((w) => filter.ageBands!.includes(w.ageBand));
  if (filter.triageLevels?.length) rows = rows.filter((w) => filter.triageLevels!.includes(w.triageLevel as never));
  if (filter.residenceTypes?.length) rows = rows.filter((w) => filter.residenceTypes!.includes(w.residenceType));
  if (filter.symptomCodes?.length) {
    rows = rows.filter((w) => w.symptoms.some((s) => filter.symptomCodes!.includes(s.symptomCode)));
  }
  if (filter.from) rows = rows.filter((w) => dayKey(w.registeredAt) >= filter.from!);
  if (filter.to) rows = rows.filter((w) => dayKey(w.registeredAt) <= filter.to!);

  return rows;
}

function countBy(rows: DemoWalkIn[], key: (row: DemoWalkIn) => string | null, label: (value: string) => string): CountBucket[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row) ?? 'UNCLASSIFIED';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({
      key: value,
      label: value === 'UNCLASSIFIED' ? 'Unclassified' : label(value),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

function buildTimeSeries(rows: DemoWalkIn[], days = 14): TimeSeriesPoint[] {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);

  const byDay = new Map<string, { count: number; series: Record<string, number> }>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    byDay.set(new Date(t).toISOString().slice(0, 10), { count: 0, series: {} });
  }

  for (const row of rows) {
    const bucket = byDay.get(dayKey(row.registeredAt));
    if (!bucket) continue;
    bucket.count += 1;
    const syndrome = row.primarySyndromeCode ?? 'UNCLASSIFIED';
    bucket.series[syndrome] = (bucket.series[syndrome] ?? 0) + 1;
  }

  return [...byDay.entries()].map(([date, value]) => ({ date, count: value.count, series: value.series }));
}

function buildGeo(rows: DemoWalkIn[]): GeoFeatureCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.residenceUnitId) continue;
    counts.set(row.residenceUnitId, (counts.get(row.residenceUnitId) ?? 0) + 1);
  }

  const features: GeoFeatureCount[] = [];
  for (const [unitId, count] of counts) {
    const unit = addressById.get(unitId);
    if (!unit) continue;
    features.push({
      id: unit.id,
      name: unit.name,
      level: unit.level,
      latitude: unit.latitude,
      longitude: unit.longitude,
      count,
      rate: unit.population ? Math.round((count / unit.population) * 1000 * 100) / 100 : null,
    });
  }
  return features.sort((a, b) => b.count - a.count);
}

function buildCampStatus(scope: UserScope): CampStatus[] {
  const today = dayKey(new Date());

  return visibleCamps(scope)
    .map((camp) => {
      const campWalkIns = state.walkIns.filter((w) => w.campId === camp.id);
      const waiting = campWalkIns.filter((w) => w.stage === 'REGISTERED' || w.stage === 'VITALS_DONE');
      return {
        campId: camp.id,
        campName: camp.name,
        districtName: camp.district.name,
        latitude: camp.latitude,
        longitude: camp.longitude,
        isOpen: camp.isActive,
        readinessPercent: camp.readiness?.readinessPercent ?? null,
        // The seeded roster is not carried into the snapshot; the camp's own
        // staffing is shown in the console against the live API.
        staffOnDuty: camp.readiness ? 5 : 0,
        walkInsToday: campWalkIns.filter((w) => dayKey(w.registeredAt) === today).length,
        waiting: waiting.length,
        criticalOpen: campWalkIns.filter((w) => w.triageLevel === 'RED' && w.stage !== 'CLOSED' && w.stage !== 'DISPENSED').length,
        lastSyncAt: camp.lastSyncAt,
        stockAlerts: state.alerts.filter((a) => a.campId === camp.id && a.type === 'STOCKOUT' && !a.acknowledgedAt).length,
      } satisfies CampStatus;
    })
    .sort((a, b) => a.campName.localeCompare(b.campName));
}

/** Daily counts per syndrome, per camp and per district, through the real detectors. */
export function computeSignals(scope: UserScope, windowDays = 14): SyndromeSignal[] {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to.getTime() - (windowDays - 1) * DAY_MS);

  const grouped = new Map<string, { name: string; type: 'CAMP' | 'DISTRICT'; id: string; syndromes: Map<string, Map<string, number>> }>();

  const bump = (type: 'CAMP' | 'DISTRICT', id: string, name: string, syndrome: string, day: string) => {
    const key = `${type}:${id}`;
    const entry = grouped.get(key) ?? { name, type, id, syndromes: new Map() };
    const bySyndrome = entry.syndromes.get(syndrome) ?? new Map<string, number>();
    bySyndrome.set(day, (bySyndrome.get(day) ?? 0) + 1);
    entry.syndromes.set(syndrome, bySyndrome);
    grouped.set(key, entry);
  };

  for (const row of visibleWalkIns(scope)) {
    if (!row.primarySyndromeCode) continue;
    if (new Date(row.registeredAt) < from) continue;
    const camp = campById.get(row.campId);
    bump('CAMP', row.campId, camp?.name ?? 'Camp', row.primarySyndromeCode, dayKey(row.registeredAt));
    bump('DISTRICT', row.districtId, camp?.district.name ?? 'District', row.primarySyndromeCode, dayKey(row.registeredAt));
  }

  const signals: SyndromeSignal[] = [];
  for (const entry of grouped.values()) {
    for (const [syndromeCode, byDay] of entry.syndromes) {
      const series: SeriesPoint[] = [];
      for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
        const key = new Date(t).toISOString().slice(0, 10);
        series.push({ date: key, count: byDay.get(key) ?? 0 });
      }

      const verdict = detectAberration(series);
      if (verdict.severity === 'NONE') continue;

      signals.push({
        syndromeCode,
        syndromeName: syndromeByCode(syndromeCode)?.name ?? syndromeCode,
        scopeType: entry.type,
        scopeId: entry.id,
        scopeName: entry.name,
        verdict,
      });
    }
  }

  return signals.sort((a, b) => b.verdict.observed - a.verdict.observed);
}

export function computeClusters(days = 3) {
  const since = Date.now() - days * DAY_MS;
  const counts = new Map<string, number>();
  for (const row of state.walkIns) {
    if (!row.onsetZoneId) continue;
    if (new Date(row.registeredAt).getTime() < since) continue;
    counts.set(row.onsetZoneId, (counts.get(row.onsetZoneId) ?? 0) + 1);
  }

  // Only leaf zones, so a parent does not double-count its children.
  const parentIds = new Set(snapshot.zones.map((z) => z.parentId).filter(Boolean));
  const areas: ScanArea[] = snapshot.zones
    .filter((z) => !parentIds.has(z.id) && z.latitude != null && z.longitude != null)
    .map((z) => ({
      id: z.id,
      name: z.name,
      latitude: z.latitude!,
      longitude: z.longitude!,
      cases: counts.get(z.id) ?? 0,
      population: z.expectedFootfall ?? 10_000,
    }));

  return scanClusters(areas, { maxRadiusKm: 8 });
}

export function computeStock(campIds: string[], days = 7) {
  const since = Date.now() - days * DAY_MS;

  const buckets = new Map<string, number[]>();
  for (const issue of snapshot.stockIssues) {
    if (!campIds.includes(issue.campId)) continue;
    const offset = Math.floor((new Date(issue.createdAt).getTime() - since) / DAY_MS);
    if (offset < 0 || offset >= days) continue;
    const key = `${issue.campId}:${issue.drugId}`;
    const series = buckets.get(key) ?? Array.from({ length: days }, () => 0);
    series[offset] = (series[offset] ?? 0) + Math.abs(issue.quantity);
    buckets.set(key, series);
  }

  return state.inventory
    .filter((row) => campIds.includes(row.campId))
    .map((row) => {
      const series = buckets.get(`${row.campId}:${row.drugId}`) ?? Array.from({ length: days }, () => 0);
      const projection = projectStock({
        drugCode: row.drug.code,
        drugName: row.drug.name,
        onHand: row.onHand,
        reorderLevel: row.drug.reorderLevel,
        dailyConsumption: series,
      });
      return { ...projection, campId: row.campId, campName: campById.get(row.campId)?.name ?? 'Camp' };
    });
}

/** The whole dashboard, assembled in the browser from the same primitives. */
export function buildDemoSnapshot(filter: DashboardFilter, scope: UserScope): DashboardSnapshot {
  const rows = filterWalkIns(filter, scope);
  const camps = buildCampStatus(scope);
  const today = dayKey(new Date());

  const clinicalDurations = rows
    .filter((row) => row.stage === 'DISPENSED' || row.stage === 'REFERRED' || row.stage === 'CLINICAL_DONE')
    .map(() => 12 + Math.round(Math.random() * 20));
  const median = clinicalDurations.length
    ? clinicalDurations.sort((a, b) => a - b)[Math.floor(clinicalDurations.length / 2)] ?? null
    : null;

  const lastSync = camps
    .map((c) => (c.lastSyncAt ? new Date(c.lastSyncAt).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);

  const nameBySymptom = new Map(SYMPTOMS.map((s) => [s.code, s.name]));
  const symptomCounts = new Map<string, number>();
  for (const row of rows) {
    for (const symptom of row.symptoms) {
      symptomCounts.set(symptom.symptomCode, (symptomCounts.get(symptom.symptomCode) ?? 0) + 1);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    filter,
    kpis: {
      totalWalkIns: rows.length,
      todayWalkIns: rows.filter((w) => dayKey(w.registeredAt) === today).length,
      waiting: rows.filter((w) => w.stage === 'REGISTERED' || w.stage === 'VITALS_DONE').length,
      criticalOpen: rows.filter((w) => w.triageLevel === 'RED' && w.stage !== 'CLOSED' && w.stage !== 'DISPENSED').length,
      referrals: rows.filter((w) => w.stage === 'REFERRED').length,
      campsActive: camps.filter((c) => c.isOpen).length,
      campsTotal: camps.length,
      staffOnDuty: camps.reduce((total, camp) => total + camp.staffOnDuty, 0),
      syncLagMinutes: lastSync ? Math.round((Date.now() - lastSync) / 60_000) : null,
      medianMinutesToClinical: median,
    },
    bySyndrome: countBy(rows, (r) => r.primarySyndromeCode, (code) => syndromeByCode(code)?.name ?? titleCase(code)),
    bySymptom: [...symptomCounts.entries()]
      .map(([code, count]) => ({ key: code, label: nameBySymptom.get(code) ?? titleCase(code), count }))
      .sort((a, b) => b.count - a.count),
    byGender: countBy(rows, (r) => r.gender, titleCase),
    byAgeBand: countBy(rows, (r) => r.ageBand, (code) => AGE_BANDS.find((b) => b.code === code)?.label ?? code),
    byTriage: countBy(rows, (r) => r.triageLevel, titleCase),
    byResidence: countBy(rows, (r) => r.residenceType, titleCase),
    byOnsetPlace: countBy(rows, (r) => r.onsetPlace, titleCase),
    timeSeries: buildTimeSeries(rows),
    geo: buildGeo(rows),
    camps,
    signals: computeSignals(scope),
    clusters: computeClusters(),
    stock: computeStock(camps.map((c) => c.campId)).filter((s) => s.risk !== 'OK'),
  };
}
