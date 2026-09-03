import { PERMISSIONS, type Permission } from './permissions.js';

/**
 * Organisational scope levels, ordered from widest to narrowest.
 * A user's data visibility is the subtree rooted at their assignment.
 */
export const SCOPE_LEVELS = [
  'STATE',
  'REGION',
  'DEPARTMENT',
  'DISTRICT',
  'FACILITY',
  'CAMP',
] as const;

export type ScopeLevel = (typeof SCOPE_LEVELS)[number];

/** Lower rank == wider authority. */
export const SCOPE_RANK: Record<ScopeLevel, number> = {
  STATE: 0,
  REGION: 1,
  DEPARTMENT: 2,
  DISTRICT: 3,
  FACILITY: 4,
  CAMP: 5,
};

export const ROLE_CODES = [
  'STATE_SUPER_ADMIN',
  'STATE_OFFICER',
  'REGIONAL_USER',
  'DEPARTMENT_HEAD',
  'DEPARTMENT_DOMAIN_USER',
  'DISTRICT_USER',
  'DISTRICT_DOMAIN_USER',
  'SUPERVISOR',
  'FIELD_STAFF',
  'VOLUNTEER',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  description: string;
  scopeLevel: ScopeLevel;
  /** Roles this role is allowed to create/manage in the admin console. */
  manages: RoleCode[];
  permissions: Permission[];
}

const P = PERMISSIONS;

const READ_ONLY_SURVEILLANCE: Permission[] = [
  P.DASHBOARD_VIEW,
  P.ALERT_READ,
  P.WALKIN_READ,
  P.CAMP_READ,
  P.EVENT_READ,
  P.FACILITY_READ,
  P.ADDRESS_READ,
  P.MASTER_READ,
  P.SYNC_PULL,
];

export const ROLE_DEFINITIONS: Record<RoleCode, RoleDefinition> = {
  STATE_SUPER_ADMIN: {
    code: 'STATE_SUPER_ADMIN',
    name: 'State Super User',
    description:
      'Full platform administrator. Configures roles, users, masters, address hierarchy and facilities; sees every district and camp.',
    scopeLevel: 'STATE',
    manages: [...ROLE_CODES],
    permissions: Object.values(P),
  },

  STATE_OFFICER: {
    code: 'STATE_OFFICER',
    name: 'State Level Officer',
    description:
      'State-wide operational oversight. Runs events and camps, acknowledges alerts, cannot alter roles or platform masters.',
    scopeLevel: 'STATE',
    manages: [
      'REGIONAL_USER',
      'DEPARTMENT_HEAD',
      'DISTRICT_USER',
      'SUPERVISOR',
      'FIELD_STAFF',
      'VOLUNTEER',
    ],
    permissions: [
      ...READ_ONLY_SURVEILLANCE,
      P.USER_READ,
      P.USER_WRITE,
      P.EVENT_WRITE,
      P.CAMP_WRITE,
      P.FACILITY_WRITE,
      P.ROSTER_READ,
      P.ROSTER_WRITE,
      P.READINESS_READ,
      P.INVENTORY_READ,
      P.REFERRAL_READ,
      P.REFERRAL_WRITE,
      P.ALERT_ACK,
      P.ANALYTICS_RUN,
      P.WALKIN_EXPORT,
      P.AUDIT_READ,
    ],
  },

  REGIONAL_USER: {
    code: 'REGIONAL_USER',
    name: 'Regional Level User',
    description:
      'Oversees a group of districts. Coordinates camps and referrals across the region.',
    scopeLevel: 'REGION',
    manages: ['DISTRICT_USER', 'SUPERVISOR', 'FIELD_STAFF', 'VOLUNTEER'],
    permissions: [
      ...READ_ONLY_SURVEILLANCE,
      P.USER_READ,
      P.CAMP_WRITE,
      P.ROSTER_READ,
      P.ROSTER_WRITE,
      P.READINESS_READ,
      P.INVENTORY_READ,
      P.REFERRAL_READ,
      P.REFERRAL_WRITE,
      P.ALERT_ACK,
      P.ANALYTICS_RUN,
      P.WALKIN_EXPORT,
    ],
  },

  DEPARTMENT_HEAD: {
    code: 'DEPARTMENT_HEAD',
    name: 'Department Head',
    description:
      'Heads a line department (Health, Revenue, Police, Fire, Sanitation). Full visibility of the department across the state.',
    scopeLevel: 'DEPARTMENT',
    manages: ['DEPARTMENT_DOMAIN_USER', 'DISTRICT_DOMAIN_USER'],
    permissions: [
      ...READ_ONLY_SURVEILLANCE,
      P.USER_READ,
      P.USER_WRITE,
      P.CAMP_WRITE,
      P.ROSTER_READ,
      P.ROSTER_WRITE,
      P.READINESS_READ,
      P.READINESS_WRITE,
      P.INVENTORY_READ,
      P.INVENTORY_WRITE,
      P.REFERRAL_READ,
      P.REFERRAL_WRITE,
      P.ALERT_ACK,
      P.ANALYTICS_RUN,
      P.WALKIN_EXPORT,
      P.AUDIT_READ,
    ],
  },

  DEPARTMENT_DOMAIN_USER: {
    code: 'DEPARTMENT_DOMAIN_USER',
    name: 'Department Domain User',
    description:
      'Subject-matter user inside a department (e.g. IDSP surveillance, drug logistics, ambulance control).',
    scopeLevel: 'DEPARTMENT',
    manages: [],
    permissions: [
      ...READ_ONLY_SURVEILLANCE,
      P.INVENTORY_READ,
      P.INVENTORY_WRITE,
      P.READINESS_READ,
      P.REFERRAL_READ,
      P.REFERRAL_WRITE,
      P.ALERT_ACK,
      P.ANALYTICS_RUN,
      P.WALKIN_EXPORT,
    ],
  },

  DISTRICT_USER: {
    code: 'DISTRICT_USER',
    name: 'District Level User',
    description:
      'District administrator for the gathering. Owns camps, rosters and stock within the district.',
    scopeLevel: 'DISTRICT',
    manages: ['DISTRICT_DOMAIN_USER', 'SUPERVISOR', 'FIELD_STAFF', 'VOLUNTEER'],
    permissions: [
      ...READ_ONLY_SURVEILLANCE,
      P.USER_READ,
      P.USER_WRITE,
      P.CAMP_WRITE,
      P.FACILITY_WRITE,
      P.ROSTER_READ,
      P.ROSTER_WRITE,
      P.READINESS_READ,
      P.READINESS_WRITE,
      P.INVENTORY_READ,
      P.INVENTORY_WRITE,
      P.REFERRAL_READ,
      P.REFERRAL_WRITE,
      P.ALERT_ACK,
      P.ANALYTICS_RUN,
      P.WALKIN_EXPORT,
    ],
  },

  DISTRICT_DOMAIN_USER: {
    code: 'DISTRICT_DOMAIN_USER',
    name: 'District Domain User',
    description:
      'District subject-matter user — e.g. DSU-IDSP, district drug store, district lab coordinator.',
    scopeLevel: 'DISTRICT',
    manages: [],
    permissions: [
      ...READ_ONLY_SURVEILLANCE,
      P.INVENTORY_READ,
      P.INVENTORY_WRITE,
      P.READINESS_READ,
      P.REFERRAL_READ,
      P.REFERRAL_WRITE,
      P.ALERT_ACK,
      P.WALKIN_EXPORT,
    ],
  },

  SUPERVISOR: {
    code: 'SUPERVISOR',
    name: 'Supervisory Staff',
    description:
      'Supervises a set of camps on the ground. Lowest level with live dashboard access, marks attendance and camp readiness.',
    scopeLevel: 'FACILITY',
    manages: ['FIELD_STAFF', 'VOLUNTEER'],
    permissions: [
      P.DASHBOARD_VIEW,
      P.ALERT_READ,
      P.ALERT_ACK,
      P.CAMP_READ,
      P.EVENT_READ,
      P.FACILITY_READ,
      P.ADDRESS_READ,
      P.MASTER_READ,
      P.USER_READ,
      P.ROSTER_READ,
      P.ROSTER_WRITE,
      P.READINESS_READ,
      P.READINESS_WRITE,
      P.INVENTORY_READ,
      P.INVENTORY_WRITE,
      P.WALKIN_READ,
      P.WALKIN_REGISTER,
      P.WALKIN_VITALS,
      P.WALKIN_CLINICAL,
      P.WALKIN_DISPENSE,
      P.WALKIN_EXPORT,
      P.REFERRAL_READ,
      P.REFERRAL_WRITE,
      P.SYNC_PUSH,
      P.SYNC_PULL,
    ],
  },

  FIELD_STAFF: {
    code: 'FIELD_STAFF',
    name: 'Field Staff',
    description:
      'Paramedic / staff nurse / medical officer at the camp. Records vitals and the clinical section of the walk-in form.',
    scopeLevel: 'CAMP',
    manages: [],
    permissions: [
      P.CAMP_READ,
      P.EVENT_READ,
      P.FACILITY_READ,
      P.ADDRESS_READ,
      P.MASTER_READ,
      P.ROSTER_READ,
      P.READINESS_READ,
      P.READINESS_WRITE,
      P.INVENTORY_READ,
      P.WALKIN_READ,
      P.WALKIN_REGISTER,
      P.WALKIN_VITALS,
      P.WALKIN_CLINICAL,
      P.WALKIN_DISPENSE,
      P.REFERRAL_READ,
      P.REFERRAL_WRITE,
      P.SYNC_PUSH,
      P.SYNC_PULL,
    ],
  },

  VOLUNTEER: {
    code: 'VOLUNTEER',
    name: 'Volunteer',
    description:
      'Registers walk-ins at the camp entrance (screens 1-9 only) and hands the record forward to a paramedic.',
    scopeLevel: 'CAMP',
    manages: [],
    permissions: [
      P.CAMP_READ,
      P.EVENT_READ,
      P.ADDRESS_READ,
      P.MASTER_READ,
      P.WALKIN_READ,
      P.WALKIN_REGISTER,
      P.SYNC_PUSH,
      P.SYNC_PULL,
    ],
  },
};

export const ROLE_LIST: RoleDefinition[] = ROLE_CODES.map((c) => ROLE_DEFINITIONS[c]);

export function permissionsForRole(code: RoleCode): Permission[] {
  return [...new Set(ROLE_DEFINITIONS[code].permissions)];
}

export function roleCanManage(actor: RoleCode, target: RoleCode): boolean {
  return ROLE_DEFINITIONS[actor].manages.includes(target);
}
