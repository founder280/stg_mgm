/**
 * Symptom master — the left-hand column of screen 4 of the field form.
 * The list is editable per event (`Symptom.appliesToEventTypes` / camp config),
 * per the note "Symptoms list may be edited based on the festival".
 */

export const SYMPTOM_GROUPS = [
  'CONSTITUTIONAL',
  'RESPIRATORY',
  'GASTROINTESTINAL',
  'DERMATOLOGICAL',
  'HAEMORRHAGIC',
  'MUSCULOSKELETAL',
  'HEPATIC',
  'TRAUMA',
  'ENVENOMATION',
  'OTHER',
] as const;

export type SymptomGroup = (typeof SYMPTOM_GROUPS)[number];

export interface SymptomDefinition {
  code: string;
  name: string;
  nameLocal?: string;
  group: SymptomGroup;
  /** Prompts the form for a structured sub-form (injury site / bite species). */
  subFormat?: 'INJURY' | 'BITE' | 'FREE_TEXT';
  /** Red-flag symptoms weigh into the triage score. */
  redFlag?: boolean;
  displayOrder: number;
}

export const SYMPTOMS: SymptomDefinition[] = [
  { code: 'FEVER', name: 'Fever', nameLocal: 'காய்ச்சல்', group: 'CONSTITUTIONAL', displayOrder: 1 },
  { code: 'COUGH', name: 'Cough', nameLocal: 'இருமல்', group: 'RESPIRATORY', displayOrder: 2 },
  { code: 'HEADACHE', name: 'Headache', nameLocal: 'தலைவலி', group: 'CONSTITUTIONAL', displayOrder: 3 },
  { code: 'DIARRHOEA', name: 'Diarrhoea', nameLocal: 'வயிற்றுப்போக்கு', group: 'GASTROINTESTINAL', displayOrder: 4 },
  { code: 'DEHYDRATION', name: 'Dehydration', nameLocal: 'நீரிழப்பு', group: 'GASTROINTESTINAL', redFlag: true, displayOrder: 5 },
  { code: 'JOINT_PAIN', name: 'Joint pain', nameLocal: 'மூட்டு வலி', group: 'MUSCULOSKELETAL', displayOrder: 6 },
  { code: 'SOB', name: 'Shortness of breath', nameLocal: 'மூச்சுத் திணறல்', group: 'RESPIRATORY', redFlag: true, displayOrder: 7 },
  { code: 'GUM_BLEED', name: 'Bleeding from gums', nameLocal: 'ஈறு இரத்தப்போக்கு', group: 'HAEMORRHAGIC', redFlag: true, displayOrder: 8 },
  { code: 'RASH', name: 'Rashes', nameLocal: 'தோல் தடிப்பு', group: 'DERMATOLOGICAL', displayOrder: 9 },
  { code: 'INJURY', name: 'Injury', nameLocal: 'காயம்', group: 'TRAUMA', subFormat: 'INJURY', displayOrder: 10 },
  { code: 'BITE', name: 'Bites', nameLocal: 'கடி', group: 'ENVENOMATION', subFormat: 'BITE', redFlag: true, displayOrder: 11 },
  { code: 'JAUNDICE', name: 'Jaundice', nameLocal: 'மஞ்சள் காமாலை', group: 'HEPATIC', displayOrder: 12 },
  { code: 'VOMITING', name: 'Vomiting', nameLocal: 'வாந்தி', group: 'GASTROINTESTINAL', displayOrder: 13 },
  { code: 'ABDOMINAL_PAIN', name: 'Abdominal pain', nameLocal: 'வயிற்று வலி', group: 'GASTROINTESTINAL', displayOrder: 14 },
  { code: 'GIDDINESS', name: 'Giddiness / faintness', nameLocal: 'மயக்கம்', group: 'CONSTITUTIONAL', displayOrder: 15 },
  { code: 'OTHERS', name: 'Others', group: 'OTHER', subFormat: 'FREE_TEXT', displayOrder: 99 },
];

/** Injury sub-types, marked on the body image as L / A / #. */
export const INJURY_TYPES = [
  { code: 'ABRASION', name: 'Abrasion', marker: 'A' },
  { code: 'LACERATION', name: 'Laceration', marker: 'L' },
  { code: 'FRACTURE', name: 'Fracture', marker: '#' },
] as const;

export type InjuryType = (typeof INJURY_TYPES)[number]['code'];

/** Bite sub-types. Snake and rabid-animal bites are always critical. */
export const BITE_TYPES = [
  { code: 'SNAKE', name: 'Snake', critical: true },
  { code: 'SCORPION', name: 'Scorpion', critical: true },
  { code: 'RABID_ANIMAL', name: 'Rabid animal', critical: true },
  { code: 'INSECT', name: 'Insect', critical: false },
  { code: 'OTHER_ANIMAL', name: 'Other animal', critical: false },
  { code: 'UNKNOWN', name: 'Unknown', critical: true },
] as const;

export type BiteType = (typeof BITE_TYPES)[number]['code'];

/**
 * Case categories — the right-hand column of screen 4. These drive the
 * referral pathway (108 ambulance + empanelled hospital by speciality).
 */
export const CASE_CATEGORIES = [
  { code: 'CRITICALLY_ILL', name: 'Critically Ill', escalates: true },
  { code: 'MEDICAL', name: 'Medical', escalates: false },
  { code: 'SURGICAL', name: 'Surgical', escalates: false },
  { code: 'ORTHO', name: 'Ortho', escalates: false },
  { code: 'PAEDIATRIC', name: 'Paediatric', escalates: false },
  { code: 'OBSTETRIC', name: 'Obstetric', escalates: false },
] as const;

export type CaseCategory = (typeof CASE_CATEGORIES)[number]['code'];

export const SYMPTOM_CODES = SYMPTOMS.map((s) => s.code);

export function symptomByCode(code: string): SymptomDefinition | undefined {
  return SYMPTOMS.find((s) => s.code === code);
}
