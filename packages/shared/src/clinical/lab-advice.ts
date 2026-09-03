/**
 * Sample-suggestion engine for screen 11.
 *
 * "Based on the symptoms reported the application may pop-up / suggest the
 * samples to be collected from the walk-in."
 */

export const SAMPLE_TYPES = [
  { code: 'SERUM', name: 'Serum' },
  { code: 'BLOOD_CULTURE', name: 'Blood for culture' },
  { code: 'THROAT_SWAB', name: 'Throat swab' },
  { code: 'SPUTUM', name: 'Sputum' },
  { code: 'STOOL', name: 'Stool' },
  { code: 'CSF', name: 'CSF' },
  { code: 'URINE', name: 'Urine' },
] as const;

export type SampleType = (typeof SAMPLE_TYPES)[number]['code'];

export const LAB_ORDER_STATUSES = ['NOT_ADVISED', 'ADVISED_REFERRED', 'SAMPLE_COLLECTED'] as const;
export type LabOrderStatus = (typeof LAB_ORDER_STATUSES)[number];

export interface SampleSuggestion {
  sample: SampleType;
  reason: string;
}

/** Suggestions keyed on the primary syndrome, with symptom-level fallbacks. */
const BY_SYNDROME: Record<string, SampleSuggestion[]> = {
  ADD: [
    { sample: 'STOOL', reason: 'Acute diarrhoeal disease — stool for culture and Vibrio screen' },
    { sample: 'SERUM', reason: 'Electrolytes in moderate/severe dehydration' },
  ],
  AJS: [{ sample: 'SERUM', reason: 'Acute jaundice — hepatitis A/E serology and LFT' }],
  AHF: [
    { sample: 'SERUM', reason: 'Haemorrhagic fever — dengue NS1/IgM and platelet count' },
    { sample: 'BLOOD_CULTURE', reason: 'Rule out enteric fever / septicaemia' },
  ],
  ILI: [{ sample: 'THROAT_SWAB', reason: 'Influenza-like illness — throat swab for respiratory panel' }],
  SARI: [
    { sample: 'THROAT_SWAB', reason: 'SARI — respiratory viral panel' },
    { sample: 'SPUTUM', reason: 'Sputum for AFB and bacterial culture' },
  ],
  ARI: [{ sample: 'THROAT_SWAB', reason: 'Respiratory infection — throat swab' }],
  PROLONGED_FEVER: [
    { sample: 'BLOOD_CULTURE', reason: 'Fever > 7 days — blood culture for enteric fever' },
    { sample: 'SERUM', reason: 'Scrub typhus / malaria serology' },
  ],
  FEVER_RASH: [{ sample: 'SERUM', reason: 'Fever with rash — measles/rubella/dengue IgM' }],
  FEVER_ARTHRALGIA: [{ sample: 'SERUM', reason: 'Chikungunya / dengue serology' }],
  AFI: [{ sample: 'SERUM', reason: 'Undifferentiated fever — malaria smear and dengue screen' }],
};

const BY_SYMPTOM: Record<string, SampleSuggestion[]> = {
  DIARRHOEA: [{ sample: 'STOOL', reason: 'Diarrhoea reported' }],
  JAUNDICE: [{ sample: 'SERUM', reason: 'Jaundice reported' }],
  COUGH: [{ sample: 'THROAT_SWAB', reason: 'Cough reported' }],
};

export function suggestSamples(
  syndromeCodes: string[],
  symptomCodes: string[] = [],
): SampleSuggestion[] {
  const out = new Map<SampleType, SampleSuggestion>();
  for (const code of syndromeCodes) {
    for (const s of BY_SYNDROME[code] ?? []) if (!out.has(s.sample)) out.set(s.sample, s);
  }
  for (const code of symptomCodes) {
    for (const s of BY_SYMPTOM[code] ?? []) if (!out.has(s.sample)) out.set(s.sample, s);
  }
  return [...out.values()];
}
