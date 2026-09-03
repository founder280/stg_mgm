import { evaluateRule, type SyndromeInput, type SyndromeRule } from './syndrome-rules.js';

export interface SyndromeDefinition {
  code: string;
  name: string;
  /** Plain-language case definition shown next to the classification in the UI. */
  caseDefinition: string;
  /** Citation surfaced to the user, per "show the reference" in the form spec. */
  reference: string;
  /** Higher wins when several syndromes match. */
  priority: number;
  /** Immediately reportable to the District Surveillance Unit (DSU-IDSP). */
  notifiable: boolean;
  rule: SyndromeRule;
}

const IDSP_P = 'IDSP Syndromic Surveillance, P-Form — NCDC, Government of India';
const IDSP_MEDIA = 'IDSP Media Scanning & Outbreak Alert Guidelines — NCDC';

/**
 * IDSP syndromic surveillance categories, adapted for a mass-gathering
 * medical camp. Order matters only for readability; `priority` decides ranking.
 */
export const SYNDROMES: SyndromeDefinition[] = [
  {
    code: 'AHF',
    name: 'Acute Haemorrhagic Fever Syndrome',
    caseDefinition:
      'Acute onset of fever of less than 3 weeks duration with any haemorrhagic manifestation (bleeding gums, petechiae, purpura).',
    reference: IDSP_P,
    priority: 100,
    notifiable: true,
    rule: {
      all: [
        { symptom: 'FEVER' },
        { symptomDurationDaysAtMost: { symptom: 'FEVER', days: 21 } },
        { any: [{ symptom: 'GUM_BLEED' }] },
      ],
    },
  },
  {
    code: 'ENVENOMATION',
    name: 'Envenomation / Animal Bite',
    caseDefinition:
      'Any history of snake bite, scorpion sting or bite by a rabid or unknown animal. Requires anti-venom / anti-rabies pathway.',
    reference: IDSP_P,
    priority: 95,
    notifiable: true,
    rule: { bite: ['SNAKE', 'SCORPION', 'RABID_ANIMAL', 'UNKNOWN', 'OTHER_ANIMAL', 'INSECT'] },
  },
  {
    code: 'ADD',
    name: 'Acute Diarrhoeal Disease',
    caseDefinition:
      'Three or more loose or watery stools in the last 24 hours, with or without dehydration. Cluster of cases suggests a common source.',
    reference: IDSP_P,
    priority: 90,
    notifiable: true,
    rule: { any: [{ symptom: 'DIARRHOEA' }, { all: [{ symptom: 'VOMITING' }, { symptom: 'DEHYDRATION' }] }] },
  },
  {
    code: 'AJS',
    name: 'Acute Jaundice Syndrome',
    caseDefinition:
      'Acute onset of jaundice (yellow discolouration of sclera/skin) with or without fever. Screen for viral hepatitis A/E in a gathering.',
    reference: IDSP_P,
    priority: 85,
    notifiable: true,
    rule: { symptom: 'JAUNDICE' },
  },
  {
    code: 'FEVER_RASH',
    name: 'Fever with Rash',
    caseDefinition:
      'Fever with maculopapular rash — consider measles, rubella, dengue, chikungunya or a scrub typhus eschar.',
    reference: IDSP_P,
    priority: 80,
    notifiable: true,
    rule: { all: [{ symptom: 'FEVER' }, { symptom: 'RASH' }] },
  },
  {
    code: 'SARI',
    name: 'Severe Acute Respiratory Infection',
    caseDefinition:
      'Fever and cough with shortness of breath, of onset within the last 10 days. Isolate and refer.',
    reference: IDSP_P,
    priority: 78,
    notifiable: true,
    rule: {
      all: [
        { symptom: 'FEVER' },
        { symptom: 'COUGH' },
        { symptom: 'SOB' },
        { symptomDurationDaysAtMost: { symptom: 'COUGH', days: 10 } },
      ],
    },
  },
  {
    code: 'ILI',
    name: 'Influenza-like Illness',
    caseDefinition:
      'Fever of 100 °F or more with cough, of onset within the last 10 days, without shortness of breath.',
    reference: IDSP_P,
    priority: 70,
    notifiable: true,
    rule: {
      all: [
        { symptom: 'FEVER' },
        { symptom: 'COUGH' },
        { symptomDurationDaysAtMost: { symptom: 'COUGH', days: 10 } },
        { not: { symptom: 'SOB' } },
      ],
    },
  },
  {
    code: 'FEVER_ARTHRALGIA',
    name: 'Fever with Arthralgia',
    caseDefinition:
      'Acute fever with joint pain — consider chikungunya or dengue in a vector-prone gathering site.',
    reference: IDSP_P,
    priority: 65,
    notifiable: true,
    rule: { all: [{ symptom: 'FEVER' }, { symptom: 'JOINT_PAIN' }] },
  },
  {
    code: 'PROLONGED_FEVER',
    name: 'Fever of more than 7 days',
    caseDefinition:
      'Fever persisting beyond 7 days — investigate for enteric fever, malaria, scrub typhus or tuberculosis.',
    reference: IDSP_P,
    priority: 62,
    notifiable: true,
    rule: { all: [{ symptom: 'FEVER' }, { symptomDurationDaysAtLeast: { symptom: 'FEVER', days: 7 } }] },
  },
  {
    code: 'AFI',
    name: 'Acute Febrile Illness',
    caseDefinition:
      'Fever of less than 7 days duration without localising signs. Baseline syndrome for undifferentiated fever.',
    reference: IDSP_P,
    priority: 40,
    notifiable: true,
    rule: { all: [{ symptom: 'FEVER' }, { symptomDurationDaysAtMost: { symptom: 'FEVER', days: 7 } }] },
  },
  {
    code: 'ARI',
    name: 'Acute Respiratory Infection',
    caseDefinition: 'Cough or shortness of breath without documented fever.',
    reference: IDSP_P,
    priority: 35,
    notifiable: false,
    rule: { all: [{ any: [{ symptom: 'COUGH' }, { symptom: 'SOB' }] }, { not: { symptom: 'FEVER' } }] },
  },
  {
    code: 'HEAT_ILLNESS',
    name: 'Heat-related Illness',
    caseDefinition:
      'Dehydration or giddiness with a high ambient temperature exposure — common in open-air gatherings and processions.',
    reference: IDSP_MEDIA,
    priority: 55,
    notifiable: false,
    rule: {
      all: [
        { any: [{ symptom: 'DEHYDRATION' }, { symptom: 'GIDDINESS' }] },
        { not: { symptom: 'DIARRHOEA' } },
      ],
    },
  },
  {
    code: 'TRAUMA',
    name: 'Injury / Trauma',
    caseDefinition:
      'Any abrasion, laceration or fracture sustained at or en route to the gathering. Stampede and crowd-crush surveillance signal.',
    reference: IDSP_MEDIA,
    priority: 60,
    notifiable: false,
    rule: { any: [{ injury: true }, { symptom: 'INJURY' }] },
  },
];

export interface SyndromeMatch {
  code: string;
  name: string;
  caseDefinition: string;
  reference: string;
  priority: number;
  notifiable: boolean;
}

/** All syndromes whose case definition the record satisfies, most urgent first. */
export function classifySyndromes(
  input: SyndromeInput,
  definitions: SyndromeDefinition[] = SYNDROMES,
): SyndromeMatch[] {
  return definitions
    .filter((d) => evaluateRule(d.rule, input))
    .sort((a, b) => b.priority - a.priority)
    .map(({ code, name, caseDefinition, reference, priority, notifiable }) => ({
      code,
      name,
      caseDefinition,
      reference,
      priority,
      notifiable,
    }));
}

/** The single syndrome a case is counted under for surveillance charts. */
export function primarySyndrome(
  input: SyndromeInput,
  definitions: SyndromeDefinition[] = SYNDROMES,
): SyndromeMatch | null {
  return classifySyndromes(input, definitions)[0] ?? null;
}

export function syndromeByCode(code: string): SyndromeDefinition | undefined {
  return SYNDROMES.find((s) => s.code === code);
}
