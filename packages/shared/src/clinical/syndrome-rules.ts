import type { BiteType } from '../masters/symptoms.js';

/**
 * A declarative rule tree so syndrome case definitions can be stored,
 * versioned and edited from the admin console without a code release.
 */
export type SyndromeRule =
  | { all: SyndromeRule[] }
  | { any: SyndromeRule[] }
  | { not: SyndromeRule }
  | { symptom: string }
  | { bite: BiteType[] }
  | { injury: true }
  | { tempAtLeastF: number }
  | { pulseAtLeast: number }
  | { symptomDurationDaysAtLeast: { symptom: string; days: number } }
  | { symptomDurationDaysAtMost: { symptom: string; days: number } }
  | { ageMonthsAtMost: number }
  | { ageMonthsAtLeast: number };

export interface SyndromeInput {
  /** Symptom code -> onset duration in hours (0 when unknown). */
  symptoms: Record<string, number>;
  biteTypes?: BiteType[];
  hasInjury?: boolean;
  temperatureF?: number | null;
  pulse?: number | null;
  ageMonths?: number | null;
}

function hours(input: SyndromeInput, symptom: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(input.symptoms, symptom)
    ? input.symptoms[symptom]
    : undefined;
}

export function evaluateRule(rule: SyndromeRule, input: SyndromeInput): boolean {
  if ('all' in rule) return rule.all.every((r) => evaluateRule(r, input));
  if ('any' in rule) return rule.any.some((r) => evaluateRule(r, input));
  if ('not' in rule) return !evaluateRule(rule.not, input);
  if ('symptom' in rule) return hours(input, rule.symptom) !== undefined;
  if ('bite' in rule) return (input.biteTypes ?? []).some((b) => rule.bite.includes(b));
  if ('injury' in rule) return input.hasInjury === true;
  if ('tempAtLeastF' in rule)
    return input.temperatureF != null && input.temperatureF >= rule.tempAtLeastF;
  if ('pulseAtLeast' in rule) return input.pulse != null && input.pulse >= rule.pulseAtLeast;
  if ('symptomDurationDaysAtLeast' in rule) {
    const h = hours(input, rule.symptomDurationDaysAtLeast.symptom);
    return h !== undefined && h >= rule.symptomDurationDaysAtLeast.days * 24;
  }
  if ('symptomDurationDaysAtMost' in rule) {
    const h = hours(input, rule.symptomDurationDaysAtMost.symptom);
    return h !== undefined && h <= rule.symptomDurationDaysAtMost.days * 24;
  }
  if ('ageMonthsAtMost' in rule)
    return input.ageMonths != null && input.ageMonths <= rule.ageMonthsAtMost;
  if ('ageMonthsAtLeast' in rule)
    return input.ageMonths != null && input.ageMonths >= rule.ageMonthsAtLeast;
  return false;
}
