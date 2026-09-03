import {
  detectAberration,
  scanClusters,
  syndromeByCode,
  type ScanArea,
  type SeriesPoint,
  type SyndromeSignal,
} from '@mgms/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { upsertAlert } from './alert.service.js';
import { stockProjections } from './inventory.service.js';

const DAY_MS = 86_400_000;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Build a gap-free daily series — a missing day is a zero, not an absent point. */
function toSeries(counts: Map<string, number>, from: Date, to: Date): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const key = dayKey(new Date(t));
    points.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return points;
}

export interface AnalyticsRunResult {
  eventsScanned: number;
  signalsFound: number;
  clustersFound: number;
  stockAlerts: number;
  operationalAlerts: number;
}

/**
 * The scheduled surveillance pass.
 *
 * Runs four independent analyses and writes their conclusions as alerts:
 *   1. syndrome aberration per camp and per district,
 *   2. spatial clustering of cases across festival zones,
 *   3. drug stockout projection per camp,
 *   4. operational checks — stale sync, camp readiness.
 */
export async function runAnalytics(options: { windowDays?: number } = {}): Promise<AnalyticsRunResult> {
  const windowDays = options.windowDays ?? 14;
  const events = await prisma.event.findMany({ where: { isActive: true } });

  let signalsFound = 0;
  let clustersFound = 0;
  let stockAlerts = 0;
  let operationalAlerts = 0;

  for (const event of events) {
    signalsFound += await detectSyndromeAberrations(event.id, windowDays);
    clustersFound += await detectSpatialClusters(event.id);
    stockAlerts += await checkStock(event.id);
    operationalAlerts += await checkOperations(event.id);
  }

  logger.info({ signalsFound, clustersFound, stockAlerts, operationalAlerts }, 'Analytics run complete');
  return { eventsScanned: events.length, signalsFound, clustersFound, stockAlerts, operationalAlerts };
}

/** Daily counts per syndrome, per camp and per district, through the detectors. */
export async function computeSyndromeSignals(
  eventId: string,
  windowDays = 14,
): Promise<SyndromeSignal[]> {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to.getTime() - (windowDays - 1) * DAY_MS);

  const rows = await prisma.walkIn.findMany({
    where: {
      eventId,
      registeredAt: { gte: from },
      primarySyndromeCode: { not: null },
    },
    select: {
      primarySyndromeCode: true,
      registeredAt: true,
      campId: true,
      districtId: true,
      camp: { select: { name: true } },
      district: { select: { name: true } },
    },
  });

  // scopeKey -> syndrome -> day -> count
  const grouped = new Map<string, { name: string; type: 'CAMP' | 'DISTRICT'; id: string; syndromes: Map<string, Map<string, number>> }>();

  const bump = (type: 'CAMP' | 'DISTRICT', id: string, name: string, syndrome: string, day: string) => {
    const key = `${type}:${id}`;
    const entry = grouped.get(key) ?? { name, type, id, syndromes: new Map() };
    const bySyndrome = entry.syndromes.get(syndrome) ?? new Map<string, number>();
    bySyndrome.set(day, (bySyndrome.get(day) ?? 0) + 1);
    entry.syndromes.set(syndrome, bySyndrome);
    grouped.set(key, entry);
  };

  for (const row of rows) {
    const day = dayKey(row.registeredAt);
    const syndrome = row.primarySyndromeCode!;
    bump('CAMP', row.campId, row.camp.name, syndrome, day);
    bump('DISTRICT', row.districtId, row.district.name, syndrome, day);
  }

  const signals: SyndromeSignal[] = [];
  for (const entry of grouped.values()) {
    for (const [syndromeCode, byDay] of entry.syndromes) {
      const verdict = detectAberration(toSeries(byDay, from, to));
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

async function detectSyndromeAberrations(eventId: string, windowDays: number): Promise<number> {
  const signals = await computeSyndromeSignals(eventId, windowDays);
  let raised = 0;

  for (const signal of signals) {
    // A single detector firing is noise on camp-scale counts; the alert waits
    // until at least two independent detectors agree.
    if (signal.verdict.severity === 'LOW') continue;

    const definition = syndromeByCode(signal.syndromeCode);
    const severity = signal.verdict.severity === 'HIGH' ? 'CRITICAL' : 'WARNING';

    await upsertAlert({
      type: 'ABERRATION',
      severity,
      title: `${signal.syndromeName} rising at ${signal.scopeName}`,
      body:
        `${signal.verdict.observed} cases today against an expected ${signal.verdict.expected} ` +
        `(${signal.verdict.excessRatio}x). Flagged by ${signal.verdict.alarmingMethods.join(', ')}. ` +
        (definition?.notifiable
          ? `${signal.syndromeName} is notifiable — inform the DSU-IDSP.`
          : 'Review camp records and water/food sources.'),
      dedupeKey: `ABERRATION:${eventId}:${signal.scopeType}:${signal.scopeId}:${signal.syndromeCode}`,
      evidence: signal.verdict,
      eventId,
      campId: signal.scopeType === 'CAMP' ? signal.scopeId : null,
      districtId: signal.scopeType === 'DISTRICT' ? signal.scopeId : null,
    });
    raised += 1;
  }

  return raised;
}

/** Kulldorff scan across festival zones, using expected footfall as the denominator. */
export async function computeSpatialClusters(eventId: string, days = 3) {
  const since = new Date(Date.now() - days * DAY_MS);

  const [zones, counts] = await Promise.all([
    prisma.eventZone.findMany({
      where: { eventId, latitude: { not: null }, longitude: { not: null } },
      select: { id: true, name: true, latitude: true, longitude: true, expectedFootfall: true, parentId: true },
    }),
    prisma.walkIn.groupBy({
      by: ['onsetZoneId'],
      where: { eventId, registeredAt: { gte: since }, onsetZoneId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countByZone = new Map(counts.map((c) => [c.onsetZoneId!, c._count._all]));

  // Only leaf zones are scanned, otherwise a parent double-counts its children.
  const parentIds = new Set(zones.map((z) => z.parentId).filter(Boolean));
  const areas: ScanArea[] = zones
    .filter((z) => !parentIds.has(z.id))
    .map((z) => ({
      id: z.id,
      name: z.name,
      latitude: z.latitude!,
      longitude: z.longitude!,
      cases: countByZone.get(z.id) ?? 0,
      population: z.expectedFootfall ?? 10_000,
    }));

  return scanClusters(areas, { maxRadiusKm: 8 });
}

async function detectSpatialClusters(eventId: string): Promise<number> {
  const clusters = await computeSpatialClusters(eventId);
  let raised = 0;

  for (const cluster of clusters) {
    // The log-likelihood ratio threshold below which a window is not worth an
    // officer's attention on camp-scale counts.
    if (cluster.logLikelihoodRatio < 5 || cluster.relativeRisk < 1.5) continue;

    await upsertAlert({
      type: 'SPATIAL_CLUSTER',
      severity: cluster.logLikelihoodRatio > 20 ? 'CRITICAL' : 'WARNING',
      title: `Case cluster around ${cluster.centreName}`,
      body:
        `${cluster.observed} cases within ${cluster.radiusKm} km against ${cluster.expected} expected ` +
        `(relative risk ${cluster.relativeRisk}x, LLR ${cluster.logLikelihoodRatio}). ` +
        'Inspect water points, food stalls and sanitation in this sector.',
      dedupeKey: `SPATIAL_CLUSTER:${eventId}:${cluster.centreId}`,
      evidence: cluster,
      eventId,
    });
    raised += 1;
  }

  return raised;
}

async function checkStock(eventId: string): Promise<number> {
  const camps = await prisma.camp.findMany({
    where: { eventId, isActive: true },
    select: { id: true, name: true, districtId: true },
  });
  const projections = await stockProjections(camps.map((c) => c.id));
  const campById = new Map(camps.map((c) => [c.id, c]));
  let raised = 0;

  for (const projection of projections) {
    if (projection.risk === 'OK' || projection.risk === 'WATCH') continue;
    const camp = campById.get(projection.campId);
    if (!camp) continue;

    await upsertAlert({
      type: 'STOCKOUT',
      severity: projection.risk === 'OUT_OF_STOCK' || projection.risk === 'STOCKOUT_IMMINENT' ? 'CRITICAL' : 'WARNING',
      title: `${projection.drugName} ${projection.risk === 'OUT_OF_STOCK' ? 'out of stock' : 'running low'} at ${camp.name}`,
      body:
        `${projection.onHand} units on hand, burning ${projection.projectedDailyBurn}/day` +
        (projection.daysToStockout !== null ? ` (about ${projection.daysToStockout} days left)` : '') +
        `. Indent ${projection.reorderQuantity} units from the district drug store.`,
      dedupeKey: `STOCKOUT:${projection.campId}:${projection.drugCode}`,
      evidence: projection,
      eventId,
      campId: camp.id,
      districtId: camp.districtId,
    });
    raised += 1;
  }

  return raised;
}

async function checkOperations(eventId: string): Promise<number> {
  const staleThreshold = new Date(Date.now() - config.SYNC_STALE_MINUTES * 60_000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const camps = await prisma.camp.findMany({
    where: { eventId, isActive: true },
    select: {
      id: true,
      name: true,
      districtId: true,
      lastSyncAt: true,
      readiness: { where: { reportDate: today }, select: { readinessPercent: true } },
    },
  });

  let raised = 0;
  for (const camp of camps) {
    if (!camp.lastSyncAt || camp.lastSyncAt < staleThreshold) {
      const minutes = camp.lastSyncAt
        ? Math.round((Date.now() - camp.lastSyncAt.getTime()) / 60_000)
        : null;
      await upsertAlert({
        type: 'SYNC_STALE',
        severity: 'WARNING',
        title: `No data received from ${camp.name}`,
        body: minutes
          ? `Last sync was ${minutes} minutes ago. Check the camp's device and connectivity.`
          : 'This camp has never synced. Check that a device has been issued and signed in.',
        dedupeKey: `SYNC_STALE:${camp.id}`,
        evidence: { lastSyncAt: camp.lastSyncAt, thresholdMinutes: config.SYNC_STALE_MINUTES },
        eventId,
        campId: camp.id,
        districtId: camp.districtId,
      });
      raised += 1;
    }

    const readiness = camp.readiness[0]?.readinessPercent;
    if (readiness == null || readiness < 90) {
      await upsertAlert({
        type: 'CAMP_NOT_READY',
        severity: readiness == null ? 'WARNING' : readiness < 75 ? 'CRITICAL' : 'WARNING',
        title: `${camp.name} readiness ${readiness == null ? 'not reported' : `at ${readiness}%`}`,
        body:
          readiness == null
            ? "Today's pre-camp readiness check has not been submitted. The supervisor must complete venue, drug and equipment verification."
            : `Equipment functional status is below the 90% threshold. Review the readiness report and replace faulty equipment.`,
        dedupeKey: `CAMP_NOT_READY:${camp.id}:${dayKey(today)}`,
        evidence: { readinessPercent: readiness },
        eventId,
        campId: camp.id,
        districtId: camp.districtId,
      });
      raised += 1;
    }
  }

  return raised;
}

let timer: NodeJS.Timeout | null = null;

/** Start the background surveillance loop. */
export function startAnalyticsScheduler() {
  if (config.ANALYTICS_INTERVAL_MINUTES <= 0) {
    logger.info('Analytics scheduler disabled (ANALYTICS_INTERVAL_MINUTES=0)');
    return;
  }
  const intervalMs = config.ANALYTICS_INTERVAL_MINUTES * 60_000;
  const tick = () => {
    runAnalytics().catch((error) => logger.error({ err: error }, 'Analytics run failed'));
  };
  tick();
  timer = setInterval(tick, intervalMs);
  timer.unref();
  logger.info({ intervalMinutes: config.ANALYTICS_INTERVAL_MINUTES }, 'Analytics scheduler started');
}

export function stopAnalyticsScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
