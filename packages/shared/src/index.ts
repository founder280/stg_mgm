/** @mgms/shared — domain model shared by the API, the web console and the field PWA. */

export * from './rbac/permissions.js';
export * from './rbac/roles.js';
export * from './rbac/scope.js';

export * from './masters/symptoms.js';
export * from './masters/address.js';
export * from './masters/facilities.js';
export * from './masters/drugs.js';

export * from './clinical/syndrome-rules.js';
export * from './clinical/syndromes.js';
export * from './clinical/vitals.js';
export * from './clinical/triage.js';
export * from './clinical/lab-advice.js';
export * from './clinical/treatment.js';

export * from './analytics/aberration.js';
export * from './analytics/spatial.js';
export * from './analytics/forecast.js';

export * from './schemas/common.js';
export * from './schemas/walkin.js';
export * from './schemas/admin.js';
export * from './schemas/sync.js';

export * from './types/dashboard.js';

export const FORM_NAME = 'Onsite Medical Camp Data Collection';
export const FORM_VERSION = '2.0';
