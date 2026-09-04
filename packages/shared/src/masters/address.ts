/**
 * Address hierarchy.
 *
 * The form spec calls for three parallel hierarchies over the same villages,
 * named here as Telangana names them — the sub-district revenue unit is the
 * mandal, and the settlement below a village is a habitation:
 *   Revenue      : District > Mandal > Panchayat > Village > Habitation
 *   Health       : District > HUD > Block > PHC > HSC > Village > Habitation
 *   Data entry   : District > Mandal > Village > Habitation  (the short path used at the camp)
 *
 * They are stored as one self-referencing tree of `AddressUnit` rows tagged
 * with a `hierarchy`, so a hamlet can be reached from either chain and a case
 * can be routed to both the Revenue officer and the DSU-IDSP of the area.
 */

export const ADDRESS_HIERARCHIES = ['ADMIN', 'REVENUE', 'HEALTH'] as const;
export type AddressHierarchy = (typeof ADDRESS_HIERARCHIES)[number];

export const ADDRESS_LEVELS = [
  'COUNTRY',
  'STATE',
  'REGION',
  'DISTRICT',
  'MANDAL',
  'PANCHAYAT',
  'HUD',
  'BLOCK',
  'PHC',
  'HSC',
  'VILLAGE',
  'HAMLET',
] as const;

export type AddressLevel = (typeof ADDRESS_LEVELS)[number];

export const LEVEL_LABELS: Record<AddressLevel, string> = {
  COUNTRY: 'Country',
  STATE: 'State',
  REGION: 'Region',
  DISTRICT: 'District',
  MANDAL: 'Mandal',
  PANCHAYAT: 'Panchayat',
  HUD: 'Health Unit District',
  BLOCK: 'Block',
  PHC: 'Primary Health Centre',
  HSC: 'Health Sub-Centre',
  VILLAGE: 'Village',
  HAMLET: 'Habitation',
};

/** Valid parent levels per hierarchy — enforced when saving the master. */
export const ALLOWED_PARENTS: Record<AddressHierarchy, Partial<Record<AddressLevel, AddressLevel[]>>> = {
  ADMIN: {
    COUNTRY: [],
    STATE: ['COUNTRY'],
    REGION: ['STATE'],
    DISTRICT: ['STATE', 'REGION'],
    MANDAL: ['DISTRICT'],
    VILLAGE: ['MANDAL'],
    HAMLET: ['VILLAGE'],
  },
  REVENUE: {
    DISTRICT: ['STATE', 'REGION'],
    MANDAL: ['DISTRICT'],
    PANCHAYAT: ['MANDAL'],
    VILLAGE: ['PANCHAYAT', 'MANDAL'],
    HAMLET: ['VILLAGE'],
  },
  HEALTH: {
    DISTRICT: ['STATE', 'REGION'],
    HUD: ['DISTRICT'],
    BLOCK: ['HUD', 'DISTRICT'],
    PHC: ['BLOCK'],
    HSC: ['PHC'],
    VILLAGE: ['HSC', 'PHC'],
    HAMLET: ['VILLAGE'],
  },
};

export function isValidParent(
  hierarchy: AddressHierarchy,
  level: AddressLevel,
  parentLevel: AddressLevel | null,
): boolean {
  const allowed = ALLOWED_PARENTS[hierarchy][level];
  if (!allowed) return false;
  if (parentLevel === null) return allowed.length === 0;
  return allowed.includes(parentLevel);
}

/** Residence classification on screen 2 — drives which map the client opens. */
export const RESIDENCE_TYPES = [
  { code: 'HOME_STATE', name: 'Telangana', mapScope: 'STATE' },
  { code: 'OTHER_STATE', name: 'Other States (India)', mapScope: 'COUNTRY' },
  { code: 'FOREIGNER', name: 'Foreigner', mapScope: 'WORLD' },
] as const;

export type ResidenceType = (typeof RESIDENCE_TYPES)[number]['code'];

/** Depth the map interface drills to for each residence type. */
export const MAP_DRILL_DEPTH: Record<ResidenceType, AddressLevel> = {
  HOME_STATE: 'HAMLET',
  OTHER_STATE: 'DISTRICT',
  FOREIGNER: 'COUNTRY',
};

/** Place of onset on screen 5. */
export const ONSET_PLACES = [
  { code: 'HOME', name: 'Home', note: 'Defaults to the residence address' },
  { code: 'FESTIVAL_AREA', name: 'Festival Area', note: 'Select the zone / sub-division' },
  { code: 'ENROUTE', name: 'En route to festival', note: 'District > Mandal > Village > Habitation' },
] as const;

export type OnsetPlace = (typeof ONSET_PLACES)[number]['code'];
