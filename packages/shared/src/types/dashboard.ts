import type { AberrationVerdict } from '../analytics/aberration.js';
import type { ScanCluster } from '../analytics/spatial.js';
import type { StockProjection } from '../analytics/forecast.js';
import type { TriageLevel } from '../clinical/triage.js';

/** Filter state shared by every dashboard widget (coordinated views). */
export interface DashboardFilter {
  eventId?: string;
  campIds?: string[];
  districtIds?: string[];
  zoneIds?: string[];
  from?: string;
  to?: string;
  syndromeCodes?: string[];
  symptomCodes?: string[];
  genders?: string[];
  ageBands?: string[];
  triageLevels?: TriageLevel[];
  residenceTypes?: string[];
}

export interface KpiSummary {
  totalWalkIns: number;
  todayWalkIns: number;
  waiting: number;
  criticalOpen: number;
  referrals: number;
  campsActive: number;
  campsTotal: number;
  staffOnDuty: number;
  syncLagMinutes: number | null;
  medianMinutesToClinical: number | null;
}

export interface CountBucket {
  key: string;
  label: string;
  count: number;
}

export interface TimeSeriesPoint {
  date: string;
  count: number;
  /** Split by syndrome/camp when the caller asks for a breakdown. */
  series?: Record<string, number>;
}

export interface GeoFeatureCount {
  id: string;
  name: string;
  level: string;
  latitude: number | null;
  longitude: number | null;
  count: number;
  /** Cases per 1000 estimated footfall, for choropleth shading. */
  rate: number | null;
}

export interface CampStatus {
  campId: string;
  campName: string;
  districtName: string;
  latitude: number | null;
  longitude: number | null;
  isOpen: boolean;
  readinessPercent: number | null;
  staffOnDuty: number;
  walkInsToday: number;
  waiting: number;
  criticalOpen: number;
  lastSyncAt: string | null;
  stockAlerts: number;
}

export interface SyndromeSignal {
  syndromeCode: string;
  syndromeName: string;
  scopeType: 'EVENT' | 'CAMP' | 'DISTRICT' | 'ZONE';
  scopeId: string;
  scopeName: string;
  verdict: AberrationVerdict;
}

export interface DashboardSnapshot {
  generatedAt: string;
  filter: DashboardFilter;
  kpis: KpiSummary;
  bySyndrome: CountBucket[];
  bySymptom: CountBucket[];
  byGender: CountBucket[];
  byAgeBand: CountBucket[];
  byTriage: CountBucket[];
  byResidence: CountBucket[];
  byOnsetPlace: CountBucket[];
  timeSeries: TimeSeriesPoint[];
  geo: GeoFeatureCount[];
  camps: CampStatus[];
  signals: SyndromeSignal[];
  clusters: ScanCluster[];
  /** Stock projections carry the camp they belong to, since the dashboard
   *  spans every camp in scope rather than one. */
  stock: Array<StockProjection & { campId: string; campName: string }>;
}

export const ALERT_TYPES = [
  'ABERRATION',
  'SPATIAL_CLUSTER',
  'CRITICAL_CASE',
  'STOCKOUT',
  'CAMP_NOT_READY',
  'SYNC_STALE',
  'REFERRAL_DELAY',
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface AlertDto {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  body: string;
  /** Machine-readable evidence: detector statistics, cluster geometry, stock rows. */
  evidence: unknown;
  campId: string | null;
  /** Resolved for display so the alert list needs no second lookup. */
  campName: string | null;
  districtId: string | null;
  districtName: string | null;
  eventId: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
}
