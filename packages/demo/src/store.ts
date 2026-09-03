import type { Permission, UserScope } from '@mgms/shared';
import raw from './snapshot.json';

/**
 * The demonstration dataset, held in memory.
 *
 * The published demo has no server: GitHub Pages serves files. So the seeded
 * gathering travels with the build and everything else — classification,
 * triage, aberration detection, the spatial scan, stock projection — is
 * computed in the browser by the very same `@mgms/shared` code the API uses.
 *
 * Writes are kept in this store for the life of the page. Reloading resets
 * them, which is the honest behaviour for a demonstration with no database.
 */

export interface DemoWalkIn {
  id: string;
  tokenNumber: string;
  name: string;
  ageYears: number;
  ageBand: string;
  gender: string;
  residenceType: string;
  residenceUnitId: string | null;
  stayTotalDays: number;
  onsetPlace: string;
  onsetZoneId: string | null;
  campId: string;
  districtId: string;
  stage: string;
  triageLevel: string;
  triageScore: number;
  primarySyndromeCode: string | null;
  registeredAt: string;
  symptoms: Array<{ symptomCode: string; onsetTotalHours: number }>;
  vitals: { systolic: number | null; diastolic: number | null; pulse: number | null; temperatureF: number | null; bmi: number | null } | null;
}

export interface DemoCamp {
  id: string;
  code: string;
  name: string;
  type: string;
  districtId: string;
  district: { id: string; name: string };
  zoneId: string | null;
  zone: { id: string; name: string } | null;
  latitude: number | null;
  longitude: number | null;
  incharge: { id: string; fullName: string; mobile: string | null } | null;
  isActive: boolean;
  lastSyncAt: string | null;
  symptomCodes: string[];
  walkInCount: number;
  readiness: {
    id: string;
    reportDate: string;
    venueReady: boolean;
    waterAvailable: boolean;
    powerAvailable: boolean;
    wasteDisposalReady: boolean;
    readinessPercent: number | null;
    feedback: string | null;
    equipment: Array<{ equipmentCode: string; status: string; quantity: number }>;
    photos: Array<{ kind: string; url: string }>;
  } | null;
}

export interface DemoUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  mobile: string | null;
  designation: string | null;
  roleCode: string;
  department: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  assignments: Array<{ scopeType: string; scopeId: string }>;
}

export interface DemoRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
  scopeLevel: string;
  isSystem: boolean;
  permissions: string[];
}

export interface DemoAddressUnit {
  id: string;
  code: string;
  name: string;
  nameLocal: string | null;
  level: string;
  hierarchy: string;
  parentId: string | null;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
}

interface Snapshot {
  generatedAt: string;
  event: Record<string, unknown> & { id: string; name: string };
  camps: DemoCamp[];
  zones: Array<{ id: string; code: string; name: string; parentId: string | null; latitude: number | null; longitude: number | null; expectedFootfall: number | null }>;
  addressUnits: DemoAddressUnit[];
  facilities: Array<Record<string, unknown> & { id: string; name: string; type: string; specialities: string[]; isEmpanelled: boolean; isActive: boolean }>;
  symptoms: Array<Record<string, unknown> & { code: string; name: string }>;
  syndromes: Array<Record<string, unknown> & { code: string; name: string }>;
  drugs: Array<Record<string, unknown> & { id: string; code: string; name: string }>;
  inventory: Array<{ campId: string; drugId: string; onHand: number; batchNumber: string | null; drug: { code: string; name: string; form: string; reorderLevel: number; emergencyTray: boolean; strength: string | null } }>;
  stockIssues: Array<{ campId: string; drugId: string; quantity: number; createdAt: string }>;
  roles: DemoRole[];
  users: DemoUser[];
  alerts: Array<Record<string, unknown> & { id: string; campId: string | null; districtId: string | null; acknowledgedAt: string | null }>;
  walkIns: DemoWalkIn[];
}

export const snapshot = raw as unknown as Snapshot;

/** Mutable state — anything the demo user creates during this page's lifetime. */
export const state = {
  walkIns: [...snapshot.walkIns] as DemoWalkIn[],
  inventory: snapshot.inventory.map((i) => ({ ...i })),
  alerts: snapshot.alerts.map((a) => ({ ...a })),
  users: snapshot.users.map((u) => ({ ...u })),
};

export function resetState() {
  state.walkIns = [...snapshot.walkIns];
  state.inventory = snapshot.inventory.map((i) => ({ ...i }));
  state.alerts = snapshot.alerts.map((a) => ({ ...a }));
  state.users = snapshot.users.map((u) => ({ ...u }));
}

export const campById = new Map(snapshot.camps.map((c) => [c.id, c]));
export const addressById = new Map(snapshot.addressUnits.map((u) => [u.id, u]));
export const roleByCode = new Map(snapshot.roles.map((r) => [r.code, r]));
export const zoneById = new Map(snapshot.zones.map((z) => [z.id, z]));

/**
 * Build a user's scope exactly as the API does at sign-in, so the demo
 * enforces the same visibility rules rather than merely describing them.
 */
export function scopeFor(user: DemoUser): UserScope {
  const role = roleByCode.get(user.roleCode);
  const level = (role?.scopeLevel ?? 'CAMP') as UserScope['level'];

  const byType = (type: string) => user.assignments.filter((a) => a.scopeType === type).map((a) => a.scopeId);
  const districtIds = new Set(byType('DISTRICT'));
  const regionIds = byType('REGION');
  const campIds = new Set(byType('CAMP'));

  if (level === 'STATE' || (level === 'DEPARTMENT' && regionIds.length === 0 && districtIds.size === 0 && campIds.size === 0)) {
    return { level: 'STATE', regionIds: [], districtIds: [], departmentIds: [], facilityIds: [], campIds: [] };
  }

  // A region assignment expands to its districts, as it does server-side.
  for (const regionId of regionIds) {
    for (const unit of snapshot.addressUnits) {
      if (unit.level === 'DISTRICT' && unit.parentId === regionId) districtIds.add(unit.id);
    }
  }

  return {
    level,
    regionIds,
    districtIds: [...districtIds],
    departmentIds: [],
    facilityIds: [],
    campIds: [...campIds],
  };
}

export function permissionsFor(user: DemoUser): Permission[] {
  return (roleByCode.get(user.roleCode)?.permissions ?? []) as Permission[];
}

/** The same rule the server applies: state sees all, everyone else an allow-list. */
export function inScope(scope: UserScope, row: { campId?: string | null; districtId?: string | null }): boolean {
  if (scope.level === 'STATE') return true;
  if (row.campId && scope.campIds.includes(row.campId)) return true;
  if (row.districtId && scope.districtIds.includes(row.districtId)) return true;
  return false;
}

export function visibleCamps(scope: UserScope): DemoCamp[] {
  return snapshot.camps.filter((camp) => inScope(scope, { campId: camp.id, districtId: camp.districtId }));
}

export function visibleWalkIns(scope: UserScope): DemoWalkIn[] {
  return state.walkIns.filter((w) => inScope(scope, { campId: w.campId, districtId: w.districtId }));
}
