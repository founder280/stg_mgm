import { EMPTY_SCOPE, stateScope, type ScopeLevel, type UserScope } from '@mgms/shared';
import { prisma } from '../db.js';

export interface AssignmentRow {
  scopeType: ScopeLevel;
  scopeId: string;
}

/**
 * Expand a user's assignments into the concrete id sets used by every scoped
 * query.
 *
 * A region assignment is expanded to its districts because operational rows
 * (camps, walk-ins) carry a districtId, not a regionId — doing the expansion
 * once at login keeps the hot query path to a single indexed `IN` clause.
 */
export async function buildUserScope(
  scopeLevel: ScopeLevel,
  assignments: AssignmentRow[],
  departmentId?: string | null,
): Promise<UserScope> {
  if (scopeLevel === 'STATE') return stateScope();

  const byType = (type: ScopeLevel) => assignments.filter((a) => a.scopeType === type).map((a) => a.scopeId);

  const regionIds = byType('REGION');
  const districtIds = new Set(byType('DISTRICT'));
  const facilityIds = byType('FACILITY');
  const campIds = new Set(byType('CAMP'));

  // A department head with no geographic assignment is a state-wide functional
  // role: their limits come from their permissions, not from geography.
  if (scopeLevel === 'DEPARTMENT' && regionIds.length === 0 && districtIds.size === 0 && campIds.size === 0) {
    return { ...stateScope(), departmentIds: departmentId ? [departmentId] : [] };
  }

  if (regionIds.length > 0) {
    const regions = await prisma.addressUnit.findMany({
      where: { id: { in: regionIds } },
      select: { id: true, path: true },
    });
    const descendants = await prisma.addressUnit.findMany({
      where: {
        level: 'DISTRICT',
        OR: regions.map((r) => ({ path: { startsWith: `${r.path}${r.id}/` } })),
      },
      select: { id: true },
    });
    descendants.forEach((d) => districtIds.add(d.id));
  }

  if (facilityIds.length > 0) {
    const camps = await prisma.camp.findMany({
      where: { facilityId: { in: facilityIds } },
      select: { id: true },
    });
    camps.forEach((c) => campIds.add(c.id));
  }

  return {
    ...EMPTY_SCOPE,
    level: scopeLevel,
    regionIds,
    districtIds: [...districtIds],
    departmentIds: departmentId ? [departmentId] : [],
    facilityIds,
    campIds: [...campIds],
  };
}

/**
 * Row filter for anything carrying `campId` / `districtId`.
 * Returns `{}` for a state-wide user and an impossible predicate for a user
 * with no assignments — never an unfiltered query by accident.
 */
export function scopeWhere(scope: UserScope): { OR?: Array<Record<string, unknown>>; id?: { in: string[] } } {
  if (scope.level === 'STATE') return {};

  const clauses: Array<Record<string, unknown>> = [];
  if (scope.campIds.length > 0) clauses.push({ campId: { in: scope.campIds } });
  if (scope.districtIds.length > 0) clauses.push({ districtId: { in: scope.districtIds } });

  // No assignment means no data, which is the safe default.
  if (clauses.length === 0) return { OR: [{ campId: '00000000-0000-0000-0000-000000000000' }] };
  return { OR: clauses };
}

/** Same idea for the `camps` table, whose own primary key is the camp id. */
export function campScopeWhere(scope: UserScope): Record<string, unknown> {
  if (scope.level === 'STATE') return {};

  const clauses: Array<Record<string, unknown>> = [];
  if (scope.campIds.length > 0) clauses.push({ id: { in: scope.campIds } });
  if (scope.districtIds.length > 0) clauses.push({ districtId: { in: scope.districtIds } });
  if (scope.facilityIds.length > 0) clauses.push({ facilityId: { in: scope.facilityIds } });

  if (clauses.length === 0) return { id: '00000000-0000-0000-0000-000000000000' };
  return { OR: clauses };
}

/** Resolve the camp ids a user may actually touch, for sync and data entry. */
export async function accessibleCampIds(scope: UserScope): Promise<string[]> {
  const camps = await prisma.camp.findMany({ where: campScopeWhere(scope), select: { id: true } });
  return camps.map((c) => c.id);
}

export async function assertCampAccess(scope: UserScope, campId: string): Promise<void> {
  if (scope.level === 'STATE') return;
  const camp = await prisma.camp.findFirst({
    where: { AND: [{ id: campId }, campScopeWhere(scope)] },
    select: { id: true },
  });
  if (!camp) {
    const { ApiError } = await import('../errors.js');
    throw ApiError.forbidden('This camp is outside your assigned area');
  }
}
