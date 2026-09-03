/** Facility and camp masters configured from the admin console. */

export const FACILITY_TYPES = [
  { code: 'CAMP_SITE', name: 'Temporary camp site' },
  { code: 'PHC', name: 'Primary Health Centre' },
  { code: 'CHC', name: 'Community Health Centre' },
  { code: 'DISTRICT_HOSPITAL', name: 'District Hospital' },
  { code: 'MEDICAL_COLLEGE', name: 'Medical College Hospital' },
  { code: 'EMPANELLED_HOSPITAL', name: 'Empanelled private hospital' },
  { code: 'LABORATORY', name: 'Laboratory' },
  { code: 'DRUG_WAREHOUSE', name: 'Drug warehouse' },
  { code: 'AMBULANCE_BASE', name: '108 ambulance base' },
  { code: 'CONTROL_ROOM', name: 'Control room' },
] as const;

export type FacilityType = (typeof FACILITY_TYPES)[number]['code'];

export const SPECIALITIES = [
  'GENERAL_MEDICINE',
  'GENERAL_SURGERY',
  'ORTHOPAEDICS',
  'PAEDIATRICS',
  'OBSTETRICS',
  'CARDIOLOGY',
  'NEUROLOGY',
  'TOXICOLOGY',
  'BURNS',
  'TRAUMA',
] as const;

export type Speciality = (typeof SPECIALITIES)[number];

/** Case category -> speciality preferred when choosing a referral hospital. */
export const CATEGORY_SPECIALITY: Record<string, Speciality> = {
  MEDICAL: 'GENERAL_MEDICINE',
  SURGICAL: 'GENERAL_SURGERY',
  ORTHO: 'ORTHOPAEDICS',
  PAEDIATRIC: 'PAEDIATRICS',
  OBSTETRIC: 'OBSTETRICS',
  CRITICALLY_ILL: 'TRAUMA',
};

export const CAMP_TYPES = [
  { code: 'MEDICAL_CAMP', name: 'Medical camp' },
  { code: 'FIRST_AID_POST', name: 'First aid post' },
  { code: 'AMBULANCE_POINT', name: 'Ambulance point' },
  { code: 'MOBILE_UNIT', name: 'Mobile medical unit' },
] as const;

export type CampType = (typeof CAMP_TYPES)[number]['code'];

export const SHIFTS = [
  { code: 'MORNING', name: 'Morning', startHour: 6, endHour: 14 },
  { code: 'EVENING', name: 'Evening', startHour: 14, endHour: 22 },
  { code: 'NIGHT', name: 'Night', startHour: 22, endHour: 6 },
] as const;

export type ShiftCode = (typeof SHIFTS)[number]['code'];

/** Equipment checked during pre-camp readiness (functional status). */
export const EQUIPMENT_MASTER = [
  { code: 'BP_APPARATUS', name: 'BP apparatus', critical: true },
  { code: 'GLUCOMETER', name: 'Glucometer', critical: true },
  { code: 'PULSE_OXIMETER', name: 'Pulse oximeter', critical: true },
  { code: 'THERMOMETER', name: 'Thermometer', critical: true },
  { code: 'WEIGHING_SCALE', name: 'Weighing scale', critical: false },
  { code: 'STADIOMETER', name: 'Height measuring scale', critical: false },
  { code: 'OXYGEN_CYLINDER', name: 'Oxygen cylinder', critical: true },
  { code: 'AMBU_BAG', name: 'Ambu bag', critical: true },
  { code: 'EMERGENCY_TRAY', name: 'Emergency drug tray', critical: true },
  { code: 'NEBULISER', name: 'Nebuliser', critical: false },
  { code: 'DRESSING_SET', name: 'Dressing set', critical: true },
  { code: 'STRETCHER', name: 'Stretcher', critical: true },
  { code: 'COLD_CHAIN_BOX', name: 'Cold chain box', critical: false },
  { code: 'BIOMEDICAL_WASTE_BINS', name: 'Bio-medical waste bins', critical: true },
] as const;

export const EQUIPMENT_STATUSES = ['FUNCTIONAL', 'NOT_FUNCTIONAL', 'NOT_AVAILABLE'] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

/** Mandatory pre-camp photographs (screen: images of camp site). */
export const CAMP_PHOTO_KINDS = [
  { code: 'BANNER', name: 'Camp banner', required: true },
  { code: 'EMERGENCY_TRAY', name: 'Emergency tray', required: true },
  { code: 'OVERVIEW', name: 'Camp overview', required: true },
  { code: 'DRUG_STOCK', name: 'Drug stock', required: false },
  { code: 'WASTE_DISPOSAL', name: 'Waste disposal point', required: false },
] as const;

export type CampPhotoKind = (typeof CAMP_PHOTO_KINDS)[number]['code'];
