import {
  AGE_BANDS,
  SYMPTOMS,
  boundsOf,
  syndromeByCode,
  type CampStatus,
  type CountBucket,
  type DashboardFilter,
  type DashboardSnapshot,
  type GeoFeatureCount,
  type KpiSummary,
  type TimeSeriesPoint,
  type UserScope,
} from '@mgms/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { scopeWhere, campScopeWhere } from './scope.service.js';
import { computeSpatialClusters, computeSyndromeSignals } from './analytics.service.js';
import { stockProjections } from './inventory.service.js';

const DAY_MS = 86_400_000;

/**
 * Translate the dashboard's filter state plus the user's scope into a single
 * Prisma predicate. Scope is applied as an AND with the user's filter, so a
 * district officer widening a filter can never widen their visibility.
 */
export function walkInWhere(filter: DashboardFilter, scope: UserScope): Prisma.WalkInWhereInput {
  const and: Prisma.WalkInWhereInput[] = [scopeWhere(scope) as Prisma.WalkInWhereInput];

  if (filter.eventId) and.push({ eventId: filter.eventId });
  if (filter.campIds?.length) and.push({ campId: { in: filter.campIds } });
  if (filter.districtIds?.length) and.push({ districtId: { in: filter.districtIds } });
  if (filter.zoneIds?.length) and.push({ onsetZoneId: { in: filter.zoneIds } });
  if (filter.syndromeCodes?.length) and.push({ primarySyndromeCode: { in: filter.syndromeCodes } });
  if (filter.genders?.length) and.push({ gender: { in: filter.genders as never } });
  if (filter.ageBands?.length) and.push({ ageBand: { in: filter.ageBands } });
  if (filter.triageLevels?.length) and.push({ triageLevel: { in: filter.triageLevels as never } });
  if (filter.residenceTypes?.length) and.push({ residenceType: { in: filter.residenceTypes as never } });
  if (filter.symptomCodes?.length) {
    and.push({ symptoms: { some: { symptomCode: { in: filter.symptomCodes } } } });
  }

  const registeredAt: Prisma.DateTimeFilter = {};
  if (filter.from) registeredAt.gte = new Date(`${filter.from}T00:00:00.000Z`);
  if (filter.to) registeredAt.lte = new Date(`${filter.to}T23:59:59.999Z`);
  if (filter.from || filter.to) and.push({ registeredAt });

  return { AND: and };
}

async function buildKpis(where: Prisma.WalkInWhereInput, scope: UserScope, eventId?: string): Promise<KpiSummary> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const campWhere: Prisma.CampWhereInput = {
    ...(campScopeWhere(scope) as Prisma.CampWhereInput),
    ...(eventId ? { eventId } : {}),
  };

  const [totalWalkIns, todayWalkIns, waiting, criticalOpen, referrals, campsTotal, campsActive, staffOnDuty, lastSync] =
    await Promise.all([
      prisma.walkIn.count({ where }),
      prisma.walkIn.count({ where: { AND: [where, { registeredAt: { gte: todayStart } }] } }),
      prisma.walkIn.count({ where: { AND: [where, { stage: { in: ['REGISTERED', 'VITALS_DONE'] } }] } }),
      prisma.walkIn.count({
        where: { AND: [where, { triageLevel: 'RED', stage: { notIn: ['CLOSED', 'DISPENSED'] } }] },
      }),
      prisma.walkIn.count({ where: { AND: [where, { stage: 'REFERRED' }] } }),
      prisma.camp.count({ where: campWhere }),
      prisma.camp.count({ where: { ...campWhere, isActive: true } }),
      prisma.attendance.count({
        where: {
          status: { in: ['PRESENT', 'LATE'] },
          rosterEntry: { dutyDate: todayStart, camp: campScopeWhere(scope) as Prisma.CampWhereInput },
        },
      }),
      prisma.camp.aggregate({ where: campWhere, _max: { lastSyncAt: true } }),
    ]);

  const medianMinutesToClinical = await medianTimeToClinical(where);

  const syncLagMinutes = lastSync._max.lastSyncAt
    ? Math.round((Date.now() - lastSync._max.lastSyncAt.getTime()) / 60_000)
    : null;

  return {
    totalWalkIns,
    todayWalkIns,
    waiting,
    criticalOpen,
    referrals,
    campsActive,
    campsTotal,
    staffOnDuty,
    syncLagMinutes,
    medianMinutesToClinical,
  };
}

/**
 * Median registration-to-clinical time — the queue metric supervisors watch.
 *
 * Only the two timestamps are read, and the median is taken in memory: the
 * alternative (a raw percentile_cont over a list of ids) has to ship every
 * matching id to the database and back, which is slower at this size and ties
 * the query to PostgreSQL.
 */
async function medianTimeToClinical(where: Prisma.WalkInWhereInput): Promise<number | null> {
  const rows = await prisma.walkIn.findMany({
    where: { AND: [where, { clinical: { isNot: null } }] },
    select: { registeredAt: true, clinical: { select: { recordedAt: true } } },
    take: 20_000,
  });

  const minutes = rows
    .map((r) =>
      r.clinical ? (r.clinical.recordedAt.getTime() - r.registeredAt.getTime()) / 60_000 : null,
    )
    .filter((m): m is number => m !== null && m >= 0)
    .sort((a, b) => a - b);

  if (minutes.length === 0) return null;
  const mid = Math.floor(minutes.length / 2);
  const median =
    minutes.length % 2 === 0 ? ((minutes[mid - 1] ?? 0) + (minutes[mid] ?? 0)) / 2 : (minutes[mid] ?? 0);
  return Math.round(median);
}

type GroupableField =
  | 'gender'
  | 'ageBand'
  | 'triageLevel'
  | 'residenceType'
  | 'onsetPlace'
  | 'primarySyndromeCode';

type GroupedRow = Partial<Record<GroupableField, string | null>> & { _count: { _all: number } };

/**
 * Count walk-ins grouped by one column.
 *
 * Prisma types `by` as a literal tuple, so a field chosen at runtime needs a
 * single cast; the `GroupableField` union above is what keeps that cast honest.
 */
async function countBy(
  field: GroupableField,
  where: Prisma.WalkInWhereInput,
  label: (key: string) => string,
): Promise<CountBucket[]> {
  const rows = (await prisma.walkIn.groupBy({
    by: [field] as ['gender'],
    where,
    _count: { _all: true },
  })) as unknown as GroupedRow[];

  return rows
    .map((row) => {
      const key = row[field] ?? null;
      return {
        key: key ?? 'UNCLASSIFIED',
        label: key ? label(key) : 'Unclassified',
        count: row._count._all,
      };
    })
    .sort((a, b) => b.count - a.count);
}

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

async function buildTimeSeries(where: Prisma.WalkInWhereInput, days = 14): Promise<TimeSeriesPoint[]> {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to.getTime() - (days - 1) * DAY_MS);

  const rows = await prisma.walkIn.findMany({
    where: { AND: [where, { registeredAt: { gte: from } }] },
    select: { registeredAt: true, primarySyndromeCode: true },
  });

  const byDay = new Map<string, { count: number; series: Record<string, number> }>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    byDay.set(new Date(t).toISOString().slice(0, 10), { count: 0, series: {} });
  }

  for (const row of rows) {
    const key = row.registeredAt.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket.count += 1;
    const syndrome = row.primarySyndromeCode ?? 'UNCLASSIFIED';
    bucket.series[syndrome] = (bucket.series[syndrome] ?? 0) + 1;
  }

  return [...byDay.entries()].map(([date, v]) => ({ date, count: v.count, series: v.series }));
}

/** Case counts per hamlet of residence — the choropleth / heat layer. */
async function buildGeo(where: Prisma.WalkInWhereInput): Promise<GeoFeatureCount[]> {
  const rows = await prisma.walkIn.groupBy({
    by: ['residenceUnitId'],
    where: { AND: [where, { residenceUnitId: { not: null } }] },
    _count: { _all: true },
  });

  const units = await prisma.addressUnit.findMany({
    where: { id: { in: rows.map((r) => r.residenceUnitId!).filter(Boolean) } },
    select: { id: true, name: true, level: true, latitude: true, longitude: true, population: true },
  });
  const unitById = new Map(units.map((u) => [u.id, u]));

  const features: GeoFeatureCount[] = [];
  for (const row of rows) {
    const unit = row.residenceUnitId ? unitById.get(row.residenceUnitId) : undefined;
    if (!unit) continue;
    const count = row._count._all;
    features.push({
      id: unit.id,
      name: unit.name,
      level: unit.level,
      latitude: unit.latitude,
      longitude: unit.longitude,
      count,
      // Cases per 1000 residents, so a small hamlet with a burst outranks a
      // large village with the same absolute count.
      rate: unit.population ? Math.round((count / unit.population) * 1000 * 100) / 100 : null,
    });
  }

  return features.sort((a, b) => b.count - a.count);
}

async function buildCampStatus(scope: UserScope, eventId?: string): Promise<CampStatus[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const camps = await prisma.camp.findMany({
    where: { ...(campScopeWhere(scope) as Prisma.CampWhereInput), ...(eventId ? { eventId } : {}) },
    select: {
      id: true,
      name: true,
      latitude: true,
      longitude: true,
      isActive: true,
      lastSyncAt: true,
      district: { select: { name: true } },
      readiness: { where: { reportDate: todayStart }, select: { readinessPercent: true } },
    },
    orderBy: { name: 'asc' },
  });

  const campIds = camps.map((c) => c.id);
  if (campIds.length === 0) return [];

  const [walkInsToday, waiting, critical, onDuty, alerts] = await Promise.all([
    prisma.walkIn.groupBy({
      by: ['campId'],
      where: { campId: { in: campIds }, registeredAt: { gte: todayStart } },
      _count: { _all: true },
    }),
    prisma.walkIn.groupBy({
      by: ['campId'],
      where: { campId: { in: campIds }, stage: { in: ['REGISTERED', 'VITALS_DONE'] } },
      _count: { _all: true },
    }),
    prisma.walkIn.groupBy({
      by: ['campId'],
      where: { campId: { in: campIds }, triageLevel: 'RED', stage: { notIn: ['CLOSED', 'DISPENSED'] } },
      _count: { _all: true },
    }),
    prisma.rosterEntry.findMany({
      where: { campId: { in: campIds }, dutyDate: todayStart, attendance: { status: { in: ['PRESENT', 'LATE'] } } },
      select: { campId: true },
    }),
    prisma.alert.groupBy({
      by: ['campId'],
      where: { campId: { in: campIds }, type: 'STOCKOUT', acknowledgedAt: null },
      _count: { _all: true },
    }),
  ]);

  const toMap = (rows: Array<{ campId: string | null; _count: { _all: number } }>) =>
    new Map(rows.filter((r) => r.campId).map((r) => [r.campId!, r._count._all]));

  const todayMap = toMap(walkInsToday);
  const waitingMap = toMap(waiting);
  const criticalMap = toMap(critical);
  const alertMap = toMap(alerts);
  const dutyMap = new Map<string, number>();
  for (const row of onDuty) dutyMap.set(row.campId, (dutyMap.get(row.campId) ?? 0) + 1);

  return camps.map((camp) => ({
    campId: camp.id,
    campName: camp.name,
    districtName: camp.district.name,
    latitude: camp.latitude,
    longitude: camp.longitude,
    isOpen: camp.isActive,
    readinessPercent: camp.readiness[0]?.readinessPercent ?? null,
    staffOnDuty: dutyMap.get(camp.id) ?? 0,
    walkInsToday: todayMap.get(camp.id) ?? 0,
    waiting: waitingMap.get(camp.id) ?? 0,
    criticalOpen: criticalMap.get(camp.id) ?? 0,
    lastSyncAt: camp.lastSyncAt?.toISOString() ?? null,
    stockAlerts: alertMap.get(camp.id) ?? 0,
  }));
}

async function buildSymptomCounts(where: Prisma.WalkInWhereInput): Promise<CountBucket[]> {
  const rows = await prisma.walkInSymptom.groupBy({
    by: ['symptomCode'],
    where: { walkIn: where },
    _count: { _all: true },
  });

  const nameByCode = new Map(SYMPTOMS.map((s) => [s.code, s.name]));
  return rows
    .map((r) => ({
      key: r.symptomCode,
      label: nameByCode.get(r.symptomCode) ?? titleCase(r.symptomCode),
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count);
}

/** The whole dashboard in one round trip, so every widget shares one filter. */
export async function buildSnapshot(filter: DashboardFilter, scope: UserScope): Promise<DashboardSnapshot> {
  const where = walkInWhere(filter, scope);

  const [kpis, bySyndrome, bySymptom, byGender, byAgeBand, byTriage, byResidence, byOnsetPlace, timeSeries, geo, camps] =
    await Promise.all([
      buildKpis(where, scope, filter.eventId),
      countBy('primarySyndromeCode', where, (k) => syndromeByCode(k)?.name ?? titleCase(k)),
      buildSymptomCounts(where),
      countBy('gender', where, titleCase),
      countBy('ageBand', where, (k) => AGE_BANDS.find((b) => b.code === k)?.label ?? k),
      countBy('triageLevel', where, titleCase),
      countBy('residenceType', where, titleCase),
      countBy('onsetPlace', where, titleCase),
      buildTimeSeries(where),
      buildGeo(where),
      buildCampStatus(scope, filter.eventId),
    ]);

  // Surveillance analytics only make sense inside one event.
  const [signals, clusters, stock] = filter.eventId
    ? await Promise.all([
        computeSyndromeSignals(filter.eventId),
        computeSpatialClusters(filter.eventId),
        stockProjections(camps.map((c) => c.campId)),
      ])
    : [[], [], []];

  return {
    generatedAt: new Date().toISOString(),
    filter,
    kpis,
    bySyndrome,
    bySymptom,
    byGender,
    byAgeBand,
    byTriage,
    byResidence,
    byOnsetPlace,
    timeSeries,
    geo,
    camps,
    signals,
    clusters,
    stock: stock.filter((s) => s.risk !== 'OK'),
  };
}

/** Map bounds for the current filter, so the client can fit its viewport. */
export async function snapshotBounds(filter: DashboardFilter, scope: UserScope) {
  const geo = await buildGeo(walkInWhere(filter, scope));
  return boundsOf(
    geo
      .filter((g) => g.latitude != null && g.longitude != null)
      .map((g) => ({ latitude: g.latitude!, longitude: g.longitude! })),
  );
}
