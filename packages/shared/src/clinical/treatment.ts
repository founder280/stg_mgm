/**
 * Standard treatment protocol packages for screen 12.
 *
 * "Treatment package may be suggested as per the Standard treatment protocol.
 * If not then manual entry shall be made." Suggestions are matched against the
 * camp's own inventory before they are shown, so a medical officer is never
 * offered a drug the camp does not hold.
 */

export const DRUG_FORMS = ['TABLET', 'SYRUP', 'SACHET', 'IVF', 'INJECTION', 'OINTMENT'] as const;
export type DrugForm = (typeof DRUG_FORMS)[number];

/** Dosage patterns as they are read out in Indian practice. */
export const DOSAGE_PATTERNS = [
  { code: '1-0-0', label: '1-0-0 (morning)', perDay: 1 },
  { code: '0-0-1', label: '0-0-1 (night)', perDay: 1 },
  { code: '1-0-1', label: '1-0-1 (twice daily)', perDay: 2 },
  { code: '1-1-1', label: '1-1-1 (thrice daily)', perDay: 3 },
  { code: 'Q6H', label: '6th hourly', perDay: 4 },
  { code: 'Q8H', label: '8th hourly', perDay: 3 },
  { code: 'SOS', label: 'SOS (as needed)', perDay: 1 },
  { code: 'STAT', label: 'STAT (single dose)', perDay: 1 },
] as const;

export type DosagePattern = (typeof DOSAGE_PATTERNS)[number]['code'];

export function dosesPerDay(pattern: string): number {
  return DOSAGE_PATTERNS.find((d) => d.code === pattern)?.perDay ?? 1;
}

/** Total units to issue for a prescription line. */
export function unitsRequired(pattern: string, days: number, unitsPerDose = 1): number {
  return dosesPerDay(pattern) * Math.max(1, days) * Math.max(1, unitsPerDose);
}

export interface ProtocolLine {
  drugCode: string;
  form: DrugForm;
  dosagePattern: DosagePattern;
  days: number;
  note?: string;
}

export interface TreatmentProtocol {
  syndromeCode: string;
  name: string;
  reference: string;
  lines: ProtocolLine[];
  advice: string[];
}

const STG = 'Standard Treatment Guidelines, Directorate of Public Health, Telangana';

export const TREATMENT_PROTOCOLS: TreatmentProtocol[] = [
  {
    syndromeCode: 'ADD',
    name: 'Acute diarrhoeal disease — ORS first',
    reference: STG,
    lines: [
      { drugCode: 'ORS', form: 'SACHET', dosagePattern: 'SOS', days: 3, note: 'One sachet in 1 L safe water after each loose stool' },
      { drugCode: 'ZINC', form: 'TABLET', dosagePattern: '1-0-0', days: 14, note: 'Children 2 months-5 years' },
    ],
    advice: ['Encourage oral fluids', 'Return immediately if unable to drink or blood in stool'],
  },
  {
    syndromeCode: 'AFI',
    name: 'Acute febrile illness — symptomatic',
    reference: STG,
    lines: [{ drugCode: 'PARACETAMOL', form: 'TABLET', dosagePattern: 'Q6H', days: 3 }],
    advice: ['Tepid sponging', 'Review in 48 hours if fever persists', 'No NSAIDs until dengue is excluded'],
  },
  {
    syndromeCode: 'ILI',
    name: 'Influenza-like illness',
    reference: STG,
    lines: [
      { drugCode: 'PARACETAMOL', form: 'TABLET', dosagePattern: 'Q8H', days: 3 },
      { drugCode: 'CETIRIZINE', form: 'TABLET', dosagePattern: '0-0-1', days: 3 },
    ],
    advice: ['Mask and cough etiquette', 'Avoid crowded enclosures at the camp'],
  },
  {
    syndromeCode: 'HEAT_ILLNESS',
    name: 'Heat exhaustion / dehydration',
    reference: STG,
    lines: [
      { drugCode: 'ORS', form: 'SACHET', dosagePattern: 'SOS', days: 1 },
      { drugCode: 'NS_IVF', form: 'IVF', dosagePattern: 'STAT', days: 1, note: '500 mL over 30 min if unable to take orally' },
    ],
    advice: ['Move to shade, loosen clothing', 'Cool sponging', 'Refer if altered sensorium'],
  },
  {
    syndromeCode: 'TRAUMA',
    name: 'Minor wound care',
    reference: STG,
    lines: [
      { drugCode: 'PARACETAMOL', form: 'TABLET', dosagePattern: 'Q8H', days: 3 },
      { drugCode: 'POVIDONE', form: 'OINTMENT', dosagePattern: '1-0-1', days: 5 },
      { drugCode: 'TT', form: 'INJECTION', dosagePattern: 'STAT', days: 1, note: 'Tetanus toxoid if not immunised in 5 years' },
    ],
    advice: ['Clean and dress the wound', 'Review in 48 hours', 'Watch for spreading redness'],
  },
  {
    syndromeCode: 'ENVENOMATION',
    name: 'Bite / sting — stabilise and refer',
    reference: STG,
    lines: [
      { drugCode: 'TT', form: 'INJECTION', dosagePattern: 'STAT', days: 1 },
      { drugCode: 'NS_IVF', form: 'IVF', dosagePattern: 'STAT', days: 1 },
    ],
    advice: [
      'Immobilise the limb, do not incise or apply a tourniquet',
      'Refer immediately via 108 to the nearest empanelled hospital with anti-snake venom',
      'Anti-rabies vaccination pathway for rabid or unknown animal bites',
    ],
  },
  {
    syndromeCode: 'ARI',
    name: 'Upper respiratory infection',
    reference: STG,
    lines: [{ drugCode: 'CETIRIZINE', form: 'TABLET', dosagePattern: '0-0-1', days: 3 }],
    advice: ['Steam inhalation', 'Warm saline gargles'],
  },
];

export interface AvailableDrug {
  drugCode: string;
  availableQuantity: number;
}

export interface SuggestedTreatment extends TreatmentProtocol {
  /** Lines the camp cannot currently dispense, so the MO can substitute. */
  unavailableDrugCodes: string[];
}

/**
 * Suggest a package for the primary syndrome, annotated with what the camp
 * actually holds in stock.
 */
export function suggestTreatment(
  syndromeCode: string | null | undefined,
  inventory: AvailableDrug[] = [],
): SuggestedTreatment | null {
  if (!syndromeCode) return null;
  const protocol = TREATMENT_PROTOCOLS.find((p) => p.syndromeCode === syndromeCode);
  if (!protocol) return null;

  const stocked = new Set(inventory.filter((i) => i.availableQuantity > 0).map((i) => i.drugCode));
  return {
    ...protocol,
    unavailableDrugCodes: protocol.lines.map((l) => l.drugCode).filter((c) => !stocked.has(c)),
  };
}
