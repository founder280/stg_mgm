import { BITE_TYPES, type BiteType, type CaseCategory } from '../masters/symptoms.js';
import { deriveVitals, type VitalsInput } from './vitals.js';

/**
 * Rule-based triage scoring. This is deliberately transparent rather than a
 * black-box model: every point carries a reason string that is shown to the
 * medical officer and stored with the record for audit.
 *
 * The score feeds the referral pathway — "Critically Ill may be transported
 * through 108, alert may be sent to coordinator".
 */

export const TRIAGE_LEVELS = ['GREEN', 'YELLOW', 'ORANGE', 'RED'] as const;
export type TriageLevel = (typeof TRIAGE_LEVELS)[number];

export interface TriageInput extends VitalsInput {
  symptomCodes: string[];
  biteTypes?: BiteType[];
  caseCategories?: CaseCategory[];
  ageMonths?: number | null;
  pregnant?: boolean;
}

export interface TriageResult {
  score: number;
  level: TriageLevel;
  reasons: string[];
  requiresAmbulance: boolean;
}

const RED_FLAG_SYMPTOMS: Record<string, [number, string]> = {
  SOB: [4, 'Shortness of breath'],
  GUM_BLEED: [4, 'Haemorrhagic manifestation'],
  DEHYDRATION: [3, 'Dehydration'],
  GIDDINESS: [2, 'Giddiness / near-syncope'],
  JAUNDICE: [2, 'Jaundice'],
};

export function scoreTriage(input: TriageInput): TriageResult {
  const reasons: string[] = [];
  let score = 0;

  if (input.caseCategories?.includes('CRITICALLY_ILL')) {
    score += 10;
    reasons.push('Marked critically ill at registration');
  }

  for (const code of input.symptomCodes) {
    const flag = RED_FLAG_SYMPTOMS[code];
    if (flag) {
      score += flag[0];
      reasons.push(flag[1]);
    }
  }

  for (const bite of input.biteTypes ?? []) {
    const def = BITE_TYPES.find((b) => b.code === bite);
    if (def?.critical) {
      score += 6;
      reasons.push(`${def.name} bite / sting`);
    }
  }

  const v = deriveVitals(input);
  if (v.bpStage === 'CRISIS') {
    score += 6;
    reasons.push('Hypertensive crisis');
  } else if (v.newlyDetectedHypertension) {
    score += 2;
    reasons.push('Blood pressure in hypertensive range');
  }
  if (input.systolic != null && input.systolic < 90) {
    score += 6;
    reasons.push('Hypotension (systolic < 90 mmHg)');
  }
  if (input.pulse != null && input.pulse > 120) {
    score += 3;
    reasons.push('Tachycardia (> 120/min)');
  }
  if (input.pulse != null && input.pulse < 50) {
    score += 3;
    reasons.push('Bradycardia (< 50/min)');
  }
  if (input.temperatureF != null && input.temperatureF >= 103) {
    score += 3;
    reasons.push('High-grade fever (>= 103 °F)');
  }

  if (input.ageMonths != null && input.ageMonths < 60) {
    score += 2;
    reasons.push('Child under 5 years');
  }
  if (input.ageMonths != null && input.ageMonths >= 720) {
    score += 2;
    reasons.push('Elderly (60+ years)');
  }
  if (input.pregnant || input.caseCategories?.includes('OBSTETRIC')) {
    score += 3;
    reasons.push('Obstetric case');
  }

  const level: TriageLevel =
    score >= 10 ? 'RED' : score >= 6 ? 'ORANGE' : score >= 3 ? 'YELLOW' : 'GREEN';

  return { score, level, reasons, requiresAmbulance: level === 'RED' };
}
