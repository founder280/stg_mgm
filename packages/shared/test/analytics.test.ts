import { describe, expect, it } from 'vitest';
import { cusum, detectAberration, earsC1, earsC2, ewma, type SeriesPoint } from '../src/analytics/aberration.js';
import { dbscan, haversineKm, scanClusters } from '../src/analytics/spatial.js';
import { holtLinear, projectStock } from '../src/analytics/forecast.js';

const series = (counts: number[]): SeriesPoint[] =>
  counts.map((count, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, count }));

describe('aberration detection', () => {
  const stable = [4, 5, 4, 6, 5, 4, 5, 5];

  it('stays silent on a stable series', () => {
    const verdict = detectAberration(series(stable));
    expect(verdict.severity).toBe('NONE');
    expect(verdict.alarmingMethods).toEqual([]);
  });

  it('fires on a sharp spike', () => {
    const verdict = detectAberration(series([...stable.slice(0, 7), 40]));
    expect(verdict.severity).toBe('HIGH');
    expect(verdict.alarmingMethods).toContain('C1');
    expect(verdict.excessRatio).toBeGreaterThan(3);
  });

  it('C2 ignores the two most recent days when building its baseline', () => {
    // A rise that starts two days ago inflates the C1 baseline but not the C2 one.
    const counts = [3, 3, 3, 3, 3, 3, 3, 12, 14, 16];
    expect(earsC2(counts).statistic).toBeGreaterThan(earsC1(counts).statistic);
  });

  it('EWMA catches a slow sustained climb that a single-day test misses', () => {
    const creeping = [5, 5, 6, 6, 7, 8, 9, 10, 11, 12];
    expect(ewma(creeping).alarm).toBe(true);
    expect(earsC1(creeping).alarm).toBe(false);
  });

  it('CUSUM accumulates small excesses', () => {
    const drift = [5, 5, 5, 5, 8, 9, 9, 10, 10, 11];
    expect(cusum(drift).alarm).toBe(true);
  });

  it('handles a series too short to have a baseline', () => {
    const verdict = detectAberration(series([2, 3]));
    expect(verdict.severity).toBe('NONE');
  });
});

describe('spatial analysis', () => {
  it('measures distance between two known points', () => {
    // Hyderabad to Warangal, roughly 135 km.
    const km = haversineKm(
      { latitude: 17.385, longitude: 78.4867 },
      { latitude: 17.9784, longitude: 79.5941 },
    );
    expect(km).toBeGreaterThan(120);
    expect(km).toBeLessThan(150);
  });

  it('groups nearby cases and leaves outliers as noise', () => {
    const cases = [
      { id: 'a', latitude: 11.75, longitude: 79.77 },
      { id: 'b', latitude: 11.751, longitude: 79.771 },
      { id: 'c', latitude: 11.752, longitude: 79.7715 },
      { id: 'd', latitude: 11.7505, longitude: 79.7705 },
      { id: 'far', latitude: 13.08, longitude: 80.27 },
    ];
    const { clusters, noise } = dbscan(cases, { epsKm: 1, minPoints: 3 });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.caseIds.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(noise).toEqual(['far']);
  });

  it('finds the excess-risk window with the spatial scan statistic', () => {
    const areas = [
      { id: 'z1', name: 'Zone 1', latitude: 11.75, longitude: 79.77, cases: 40, population: 1000 },
      { id: 'z2', name: 'Zone 2', latitude: 11.752, longitude: 79.772, cases: 35, population: 1000 },
      { id: 'z3', name: 'Zone 3', latitude: 11.9, longitude: 79.9, cases: 5, population: 1000 },
      { id: 'z4', name: 'Zone 4', latitude: 12.1, longitude: 80.1, cases: 4, population: 1000 },
      { id: 'z5', name: 'Zone 5', latitude: 12.3, longitude: 80.3, cases: 6, population: 1000 },
    ];
    const clusters = scanClusters(areas, { maxRadiusKm: 30 });
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters[0]?.relativeRisk).toBeGreaterThan(1.5);
    expect(clusters[0]?.areaIds).toContain('z1');
  });

  it('returns no clusters when there are no cases', () => {
    const areas = [{ id: 'z1', name: 'Zone 1', latitude: 11.75, longitude: 79.77, cases: 0, population: 100 }];
    expect(scanClusters(areas)).toEqual([]);
  });
});

describe('forecasting', () => {
  it('projects a rising trend forward', () => {
    const result = holtLinear([10, 12, 14, 16, 18], 3);
    expect(result.trend).toBeGreaterThan(0);
    expect(result.forecast[0]!.value).toBeGreaterThan(18);
    expect(result.forecast[2]!.value).toBeGreaterThan(result.forecast[0]!.value);
    expect(result.forecast[0]!.upper).toBeGreaterThanOrEqual(result.forecast[0]!.value);
  });

  it('never forecasts a negative count', () => {
    const result = holtLinear([20, 12, 6, 2, 1], 4);
    expect(result.forecast.every((f) => f.value >= 0 && f.lower >= 0)).toBe(true);
  });

  it('flags an imminent stockout from a rising burn rate', () => {
    const projection = projectStock({
      drugCode: 'ORS',
      drugName: 'ORS sachet',
      onHand: 40,
      reorderLevel: 150,
      dailyConsumption: [20, 30, 45],
    });
    expect(projection.daysToStockout).toBeLessThanOrEqual(1);
    expect(projection.risk).toBe('STOCKOUT_IMMINENT');
    expect(projection.reorderQuantity).toBeGreaterThan(0);
  });

  it('reports out of stock without dividing by zero', () => {
    const projection = projectStock({
      drugCode: 'ASV',
      drugName: 'Anti-snake venom',
      onHand: 0,
      reorderLevel: 10,
      dailyConsumption: [0, 0, 0],
    });
    expect(projection.risk).toBe('OUT_OF_STOCK');
    expect(projection.daysToStockout).toBeNull();
  });
});
