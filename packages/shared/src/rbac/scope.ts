import { SCOPE_RANK, type ScopeLevel } from './roles.js';
import type { Permission } from './permissions.js';

/**
 * The geographic / organisational slice of data a signed-in user may see.
 * Built from the user's assignments at login and carried in the access token.
 */
export interface UserScope {
  level: ScopeLevel;
  regionIds: string[];
  districtIds: string[];
  departmentIds: string[];
  facilityIds: string[];
  campIds: string[];
}

/** The slice a given row of data belongs to. */
export interface ResourceScope {
  regionId?: string | null;
  districtId?: string | null;
  departmentId?: string | null;
  facilityId?: string | null;
  campId?: string | null;
}

export const EMPTY_SCOPE: UserScope = {
  level: 'CAMP',
  regionIds: [],
  districtIds: [],
  departmentIds: [],
  facilityIds: [],
  campIds: [],
};

export function stateScope(): UserScope {
  return { ...EMPTY_SCOPE, level: 'STATE' };
}

/**
 * A user sees a resource when the resource sits inside at least one of the
 * user's assignments. State-level users see everything; every other level is
 * an explicit allow-list, so an unassigned user sees nothing.
 */
export function canAccessResource(scope: UserScope, resource: ResourceScope): boolean {
  if (scope.level === 'STATE') return true;

  const checks: Array<[string[] , string | null | undefined]> = [
    [scope.campIds, resource.campId],
    [scope.facilityIds, resource.facilityId],
    [scope.districtIds, resource.districtId],
    [scope.regionIds, resource.regionId],
    [scope.departmentIds, resource.departmentId],
  ];

  for (const [allowed, value] of checks) {
    if (allowed.length > 0 && value && allowed.includes(value)) return true;
  }
  return false;
}

/** True when `actor` sits at or above `other` in the organisational hierarchy. */
export function outranks(actor: ScopeLevel, other: ScopeLevel): boolean {
  return SCOPE_RANK[actor] <= SCOPE_RANK[other];
}

export interface Principal {
  userId: string;
  roleCode: string;
  permissions: Permission[];
  scope: UserScope;
}

export function hasPermission(principal: Principal, permission: Permission): boolean {
  return principal.permissions.includes(permission);
}

export function hasAnyPermission(principal: Principal, permissions: Permission[]): boolean {
  return permissions.some((p) => principal.permissions.includes(p));
}
