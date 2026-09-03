/**
 * Spatial analysis over hamlet / camp geocodes.
 *
 * The form spec notes that map-entered addresses are "analysed as offline data
 * based on the pre-fixed geocodes of the hamlets", and that the result is
 * "passed to the incharge of the service area and DSU-IDSP concerned" — which
 * is exactly what `scanClusters` produces.
 */

export interface GeoCase {
  id: string;
  latitude: number;
  longitude: number;
  /** Optional weight, e.g. number of cases at an aggregated hamlet centroid. */
  weight?: number;
  label?: string;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface DbscanOptions {
  /** Neighbourhood radius in kilometres. */
  epsKm: number;
  /** Minimum weighted case count for a point to be a core point. */
  minPoints: number;
}

export interface Cluster {
  id: number;
  caseIds: string[];
  size: number;
  centroid: { latitude: number; longitude: number };
  radiusKm: number;
}

/**
 * Density-based clustering. Unlike a fixed grid it finds clusters of any shape
 * and does not split a cluster that straddles a grid boundary.
 */
export function dbscan(cases: GeoCase[], options: DbscanOptions): { clusters: Cluster[]; noise: string[] } {
  const { epsKm, minPoints } = options;
  const labels = new Map<string, number>(); // -1 = noise, >=0 cluster id
  const visited = new Set<string>();
  const byId = new Map(cases.map((c) => [c.id, c]));
  let clusterId = 0;

  const weightOf = (c: GeoCase) => c.weight ?? 1;

  const neighbours = (c: GeoCase) =>
    cases.filter((o) => o.id !== c.id && haversineKm(c, o) <= epsKm);

  const weightSum = (list: GeoCase[]) => list.reduce((a, c) => a + weightOf(c), 0);

  for (const point of cases) {
    if (visited.has(point.id)) continue;
    visited.add(point.id);

    const seeds = neighbours(point);
    if (weightSum(seeds) + weightOf(point) < minPoints) {
      labels.set(point.id, -1);
      continue;
    }

    labels.set(point.id, clusterId);
    const queue = [...seeds];
    while (queue.length > 0) {
      const q = queue.shift()!;
      if (!visited.has(q.id)) {
        visited.add(q.id);
        const qn = neighbours(q);
        if (weightSum(qn) + weightOf(q) >= minPoints) queue.push(...qn);
      }
      const existing = labels.get(q.id);
      if (existing === undefined || existing === -1) labels.set(q.id, clusterId);
    }
    clusterId += 1;
  }

  const clusters: Cluster[] = [];
  for (let id = 0; id < clusterId; id += 1) {
    const members = [...labels.entries()]
      .filter(([, l]) => l === id)
      .map(([caseId]) => byId.get(caseId)!)
      .filter(Boolean);
    if (members.length === 0) continue;

    const totalWeight = weightSum(members);
    const centroid = {
      latitude: members.reduce((a, c) => a + c.latitude * weightOf(c), 0) / totalWeight,
      longitude: members.reduce((a, c) => a + c.longitude * weightOf(c), 0) / totalWeight,
    };
    clusters.push({
      id,
      caseIds: members.map((m) => m.id),
      size: totalWeight,
      centroid,
      radiusKm: Math.max(...members.map((m) => haversineKm(centroid, m)), 0),
    });
  }

  return {
    clusters: clusters.sort((a, b) => b.size - a.size),
    noise: [...labels.entries()].filter(([, l]) => l === -1).map(([id]) => id),
  };
}

export interface ScanArea {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Observed cases in this area for the period. */
  cases: number;
  /** Population or footfall at risk — the expectation denominator. */
  population: number;
}

export interface ScanCluster {
  centreId: string;
  centreName: string;
  /** Coordinates of the centre area, so a map can draw the window directly. */
  centreLatitude: number;
  centreLongitude: number;
  areaIds: string[];
  radiusKm: number;
  observed: number;
  expected: number;
  relativeRisk: number;
  /** Kulldorff spatial-scan log-likelihood ratio. Higher = less likely chance. */
  logLikelihoodRatio: number;
}

/**
 * Kulldorff circular spatial scan statistic under a Poisson model.
 *
 * For every area taken as a centre, circles of growing radius are evaluated and
 * the window with the highest likelihood ratio is kept. This is the standard
 * approach in SaTScan; the Monte-Carlo p-value is deliberately left out because
 * on camp-scale data the ranked LLR is what officers act on, and the API keeps
 * the response cheap enough to compute on every dashboard refresh.
 */
export function scanClusters(
  areas: ScanArea[],
  options: { maxRadiusKm?: number; maxPopulationFraction?: number } = {},
): ScanCluster[] {
  const maxRadiusKm = options.maxRadiusKm ?? 25;
  const maxFraction = options.maxPopulationFraction ?? 0.5;

  const totalCases = areas.reduce((a, x) => a + x.cases, 0);
  const totalPop = areas.reduce((a, x) => a + x.population, 0);
  if (totalCases === 0 || totalPop === 0) return [];

  const results: ScanCluster[] = [];

  for (const centre of areas) {
    const sorted = areas
      .map((a) => ({ area: a, distance: haversineKm(centre, a) }))
      .filter((x) => x.distance <= maxRadiusKm)
      .sort((a, b) => a.distance - b.distance);

    let observed = 0;
    let population = 0;
    let best: ScanCluster | null = null;
    const included: string[] = [];

    for (const { area, distance } of sorted) {
      observed += area.cases;
      population += area.population;
      included.push(area.id);
      if (population / totalPop > maxFraction) break;

      const expected = (totalCases * population) / totalPop;
      if (observed <= expected) continue;

      const outsideObserved = totalCases - observed;
      const outsideExpected = totalCases - expected;
      if (outsideObserved <= 0 || outsideExpected <= 0) continue;

      const llr =
        observed * Math.log(observed / expected) +
        outsideObserved * Math.log(outsideObserved / outsideExpected);

      if (!best || llr > best.logLikelihoodRatio) {
        best = {
          centreId: centre.id,
          centreName: centre.name,
          centreLatitude: centre.latitude,
          centreLongitude: centre.longitude,
          areaIds: [...included],
          radiusKm: Math.round(distance * 100) / 100,
          observed,
          expected: Math.round(expected * 100) / 100,
          relativeRisk: Math.round((observed / expected) * 100) / 100,
          logLikelihoodRatio: Math.round(llr * 100) / 100,
        };
      }
    }

    if (best) results.push(best);
  }

  return dedupeOverlapping(results).sort((a, b) => b.logLikelihoodRatio - a.logLikelihoodRatio);
}

/** Keep the strongest cluster among windows that share areas. */
function dedupeOverlapping(clusters: ScanCluster[]): ScanCluster[] {
  const sorted = [...clusters].sort((a, b) => b.logLikelihoodRatio - a.logLikelihoodRatio);
  const kept: ScanCluster[] = [];
  const claimed = new Set<string>();

  for (const cluster of sorted) {
    if (cluster.areaIds.some((id) => claimed.has(id))) continue;
    kept.push(cluster);
    cluster.areaIds.forEach((id) => claimed.add(id));
  }
  return kept;
}

/** Bounding box helper for fitting the dashboard map to the current filter. */
export function boundsOf(points: Array<{ latitude: number; longitude: number }>) {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lons),
    east: Math.max(...lons),
  };
}
