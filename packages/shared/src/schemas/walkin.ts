import { z } from 'zod';
import { captureMetaSchema, geoPointSchema } from './common.js';
import { BITE_TYPES, CASE_CATEGORIES, INJURY_TYPES, SYMPTOM_CODES } from '../masters/symptoms.js';
import { LAB_ORDER_STATUSES, SAMPLE_TYPES } from '../clinical/lab-advice.js';
import { DOSAGE_PATTERNS, DRUG_FORMS } from '../clinical/treatment.js';
import { ONSET_PLACES, RESIDENCE_TYPES } from '../masters/address.js';

const codes = <T extends readonly { code: string }[]>(list: T) =>
  list.map((i) => i.code) as [string, ...string[]];

/**
 * Screen 1 — name.
 * "Uppercase as default", "No special character is allowed except space",
 * "Length may be restricted to 50".
 */
export const walkInNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(50, 'Name must be 50 characters or fewer')
  .regex(/^[A-Za-z ]+$/, 'Only letters and spaces are allowed')
  .transform((v) => v.toUpperCase().replace(/\s+/g, ' '));

/** Screen 1 — age in completed years / months / days, 1-150 years. */
export const ageSchema = z
  .object({
    years: z.number().int().min(0).max(150).default(0),
    months: z.number().int().min(0).max(11).default(0),
    days: z.number().int().min(0).max(30).default(0),
  })
  .refine((a) => a.years + a.months + a.days > 0, {
    message: 'Enter age in completed years, months or days',
  })
  .refine((a) => a.years <= 150, { message: 'Age cannot exceed 150 years' });

export const GENDERS = ['MALE', 'FEMALE', 'TRANSGENDER'] as const;
export const genderSchema = z.enum(GENDERS);

/** Screen 3 — 10-digit Indian mobile number, stored with the +91 prefix. */
export const mobileSchema = z
  .string()
  .trim()
  .regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
  .transform((v) => (v.startsWith('+91') ? v : `+91${v}`));

/** Screen 2 — residence, resolved either to an address unit or free text. */
export const residenceSchema = z.object({
  residenceType: z.enum(codes(RESIDENCE_TYPES)),
  addressUnitId: z.string().uuid().nullable().optional(),
  /** Free text for other states / foreigners where the tree is not loaded. */
  addressText: z.string().max(240).optional(),
  countryCode: z.string().length(2).optional(),
  /** Days already spent at this residence, asked alongside the festival stay. */
  daysAtResidence: z.number().int().min(0).max(36500).optional(),
});

/** Screen 3 — stay at the festival area before the reference date. */
export const festivalStaySchema = z.object({
  years: z.number().int().min(0).max(50).default(0),
  months: z.number().int().min(0).max(11).default(0),
  days: z.number().int().min(0).max(30).default(0),
});

/** Screen 4 — a reported symptom with its onset (default 1 day, per spec). */
export const symptomEntrySchema = z.object({
  symptomCode: z.enum(SYMPTOM_CODES as [string, ...string[]]),
  onsetDays: z.number().int().min(0).max(365).default(1),
  onsetHours: z.number().int().min(0).max(23).default(0),
  note: z.string().max(240).optional(),
});

export const injuryDetailSchema = z.object({
  injuryType: z.enum(codes(INJURY_TYPES)),
  bodySite: z.string().max(80).optional(),
  lengthCm: z.number().min(0).max(200).optional(),
  /** Normalised marker coordinates on the body diagram, 0..1. */
  markerX: z.number().min(0).max(1).optional(),
  markerY: z.number().min(0).max(1).optional(),
  note: z.string().max(500).optional(),
});

export const biteDetailSchema = z.object({
  biteType: z.enum(codes(BITE_TYPES)),
  bodySite: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
});

/** Screens 1-5, entered by a volunteer or paramedic. */
export const registrationSchema = z.object({
  campId: z.string().uuid(),
  name: walkInNameSchema,
  age: ageSchema,
  gender: genderSchema,
  residence: residenceSchema,
  mobile: mobileSchema.optional(),
  festivalStay: festivalStaySchema,
  symptoms: z.array(symptomEntrySchema).default([]),
  caseCategories: z.array(z.enum(codes(CASE_CATEGORIES))).default([]),
  injuries: z.array(injuryDetailSchema).default([]),
  bites: z.array(biteDetailSchema).default([]),
  otherSymptomText: z.string().max(240).optional(),
  onsetPlace: z.enum(codes(ONSET_PLACES)),
  onsetZoneId: z.string().uuid().nullable().optional(),
  onsetAddressUnitId: z.string().uuid().nullable().optional(),
  location: geoPointSchema.optional(),
  capture: captureMetaSchema,
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

/** Screen 6 — measurements, all optional, recorded by a paramedic. */
export const vitalsSchema = z.object({
  weightKg: z.number().min(0.5).max(300).nullable().optional(),
  heightCm: z.number().min(20).max(250).nullable().optional(),
  systolic: z.number().int().min(50).max(300).nullable().optional(),
  diastolic: z.number().int().min(20).max(200).nullable().optional(),
  pulse: z.number().int().min(20).max(250).nullable().optional(),
  temperatureF: z.number().min(85).max(112).nullable().optional(),
  capture: captureMetaSchema,
});

export type VitalsSubmission = z.infer<typeof vitalsSchema>;

/** Screen 7 — laboratory investigations. Defaults to "Not advised". */
export const labOrderSchema = z.object({
  status: z.enum(LAB_ORDER_STATUSES).default('NOT_ADVISED'),
  samples: z.array(z.enum(codes(SAMPLE_TYPES))).default([]),
  labFacilityId: z.string().uuid().nullable().optional(),
  labelId: z.string().max(40).optional(),
  note: z.string().max(500).optional(),
});

/** Screen 8 — treatment given. */
export const prescriptionLineSchema = z.object({
  form: z.enum(DRUG_FORMS),
  drugId: z.string().uuid().nullable().optional(),
  drugCode: z.string().max(40).optional(),
  drugName: z.string().max(120),
  dosagePattern: z.enum(codes(DOSAGE_PATTERNS)),
  days: z.number().int().min(1).max(30).default(3),
  quantity: z.number().int().min(1).max(500),
  note: z.string().max(240).optional(),
});

export const dressingSchema = z.object({
  performed: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
  reviewAdvisedOn: z.coerce.date().nullable().optional(),
});

/** Screens 7-9, entered by the medical officer. */
export const clinicalSchema = z.object({
  provisionalDiagnosis: z.string().max(240).optional(),
  labOrder: labOrderSchema.optional(),
  prescriptions: z.array(prescriptionLineSchema).default([]),
  dressing: dressingSchema.optional(),
  referral: z
    .object({
      required: z.boolean().default(false),
      facilityId: z.string().uuid().nullable().optional(),
      speciality: z.string().max(40).optional(),
      ambulanceRequested: z.boolean().default(false),
      reason: z.string().max(500).optional(),
    })
    .optional(),
  advice: z.string().max(1000).optional(),
  capture: captureMetaSchema,
});

export type ClinicalSubmission = z.infer<typeof clinicalSchema>;

/**
 * Walk-in lifecycle. "Save and Forward will send the details to the next level."
 */
export const WALKIN_STAGES = [
  'REGISTERED', // volunteer finished screens 1-5
  'VITALS_DONE', // paramedic finished screen 6
  'CLINICAL_DONE', // medical officer finished screens 7-9
  'DISPENSED', // pharmacy issued the prescription
  'REFERRED',
  'CLOSED',
] as const;

export type WalkInStage = (typeof WALKIN_STAGES)[number];

export const STAGE_ORDER: Record<WalkInStage, number> = {
  REGISTERED: 0,
  VITALS_DONE: 1,
  CLINICAL_DONE: 2,
  DISPENSED: 3,
  REFERRED: 3,
  CLOSED: 4,
};

/** Allowed forward transitions; anything else is rejected by the API. */
export const STAGE_TRANSITIONS: Record<WalkInStage, WalkInStage[]> = {
  REGISTERED: ['VITALS_DONE', 'CLINICAL_DONE', 'REFERRED', 'CLOSED'],
  VITALS_DONE: ['CLINICAL_DONE', 'REFERRED', 'CLOSED'],
  CLINICAL_DONE: ['DISPENSED', 'REFERRED', 'CLOSED'],
  DISPENSED: ['REFERRED', 'CLOSED'],
  // A referred patient is still given stabilising drugs at the camp before
  // transfer, so dispensing after referral is a legal — and common — outcome.
  REFERRED: ['DISPENSED', 'CLOSED'],
  CLOSED: [],
};

export function canTransition(from: WalkInStage, to: WalkInStage): boolean {
  return STAGE_TRANSITIONS[from].includes(to);
}
