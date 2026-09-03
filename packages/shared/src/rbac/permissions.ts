/**
 * Permission catalogue for the Mass Gathering Health Management System.
 *
 * A permission is `<module>.<action>`. Modules mirror the admin console
 * sections and the operational surfaces (camp data entry, dashboard).
 */

export const PERMISSIONS = {
  // Admin console — identity
  ROLE_READ: 'role.read',
  ROLE_WRITE: 'role.write',
  USER_READ: 'user.read',
  USER_WRITE: 'user.write',
  USER_RESET_PASSWORD: 'user.reset_password',

  // Admin console — masters
  MASTER_READ: 'master.read',
  MASTER_WRITE: 'master.write',
  ADDRESS_READ: 'address.read',
  ADDRESS_WRITE: 'address.write',
  FACILITY_READ: 'facility.read',
  FACILITY_WRITE: 'facility.write',

  // Events, camps and readiness
  EVENT_READ: 'event.read',
  EVENT_WRITE: 'event.write',
  CAMP_READ: 'camp.read',
  CAMP_WRITE: 'camp.write',
  ROSTER_READ: 'roster.read',
  ROSTER_WRITE: 'roster.write',
  READINESS_READ: 'readiness.read',
  READINESS_WRITE: 'readiness.write',
  INVENTORY_READ: 'inventory.read',
  INVENTORY_WRITE: 'inventory.write',

  // Clinical walk-in workflow (the three-part split from the field form)
  WALKIN_READ: 'walkin.read',
  WALKIN_REGISTER: 'walkin.register', // screens 1-9: identity, symptoms, onset
  WALKIN_VITALS: 'walkin.vitals', // screen 10: measurements
  WALKIN_CLINICAL: 'walkin.clinical', // screens 11-13: labs, treatment, dressing
  WALKIN_DISPENSE: 'walkin.dispense', // pharmacy issues against the prescription
  WALKIN_EXPORT: 'walkin.export',

  // Referral / emergency coordination
  REFERRAL_READ: 'referral.read',
  REFERRAL_WRITE: 'referral.write',

  // Surveillance
  DASHBOARD_VIEW: 'dashboard.view',
  ALERT_READ: 'alert.read',
  ALERT_ACK: 'alert.acknowledge',
  ANALYTICS_RUN: 'analytics.run',

  // Platform
  AUDIT_READ: 'audit.read',
  SYNC_PUSH: 'sync.push',
  SYNC_PULL: 'sync.pull',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const PERMISSION_MODULES = [
  'role',
  'user',
  'master',
  'address',
  'facility',
  'event',
  'camp',
  'roster',
  'readiness',
  'inventory',
  'walkin',
  'referral',
  'dashboard',
  'alert',
  'analytics',
  'audit',
  'sync',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export function moduleOf(permission: Permission): PermissionModule {
  return permission.split('.')[0] as PermissionModule;
}
