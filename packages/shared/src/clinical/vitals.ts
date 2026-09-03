/** Derived measures and flags from screen 10 (measurements). */

export interface VitalsInput {
  weightKg?: number | null;
  heightCm?: number | null;
  systolic?: number | null;
  diastolic?: number | null;
  pulse?: number | null;
  temperatureF?: number | null;
}

export const BMI_CATEGORIES = [
  { code: 'UNDERWEIGHT', label: 'Underweight', max: 18.5 },
  { code: 'NORMAL', label: 'Normal', max: 23 },
  { code: 'OVERWEIGHT', label: 'Overweight', max: 25 },
  { code: 'OBESE', label: 'Obese', max: Infinity },
] as const;

export type BmiCategory = (typeof BMI_CATEGORIES)[number]['code'];

/** Asia-Pacific BMI cut-offs, which is what Indian public-health programmes use. */
export function bmiCategory(bmi: number): BmiCategory {
  return (BMI_CATEGORIES.find((c) => bmi < c.max) ?? BMI_CATEGORIES[3]).code;
}

export function calculateBmi(weightKg?: number | null, heightCm?: number | null): number | null {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export const BP_STAGES = ['NORMAL', 'ELEVATED', 'STAGE_1', 'STAGE_2', 'CRISIS'] as const;
export type BpStage = (typeof BP_STAGES)[number];

/** JNC-style staging; STAGE_1 and above is a "newly detected hypertension" candidate. */
export function bloodPressureStage(systolic?: number | null, diastolic?: number | null): BpStage | null {
  if (systolic == null || diastolic == null) return null;
  if (systolic >= 180 || diastolic >= 120) return 'CRISIS';
  if (systolic >= 140 || diastolic >= 90) return 'STAGE_2';
  if (systolic >= 130 || diastolic >= 80) return 'STAGE_1';
  if (systolic >= 120) return 'ELEVATED';
  return 'NORMAL';
}

export interface VitalsDerived {
  bmi: number | null;
  bmiCategory: BmiCategory | null;
  bpStage: BpStage | null;
  newlyDetectedHypertension: boolean;
  feverPresent: boolean;
  tachycardia: boolean;
}

export function deriveVitals(v: VitalsInput): VitalsDerived {
  const bmi = calculateBmi(v.weightKg, v.heightCm);
  const bpStage = bloodPressureStage(v.systolic, v.diastolic);
  return {
    bmi,
    bmiCategory: bmi == null ? null : bmiCategory(bmi),
    bpStage,
    newlyDetectedHypertension: bpStage === 'STAGE_2' || bpStage === 'CRISIS',
    feverPresent: v.temperatureF != null && v.temperatureF >= 100.4,
    tachycardia: v.pulse != null && v.pulse > 100,
  };
}

/** Total age in months, from the three-part age control on screen 1. */
export function ageInMonths(years = 0, months = 0, days = 0): number {
  return years * 12 + months + days / 30;
}

export const AGE_BANDS = [
  { code: '0-4', label: '0-4 y', maxMonths: 60 },
  { code: '5-14', label: '5-14 y', maxMonths: 180 },
  { code: '15-24', label: '15-24 y', maxMonths: 300 },
  { code: '25-44', label: '25-44 y', maxMonths: 540 },
  { code: '45-59', label: '45-59 y', maxMonths: 720 },
  { code: '60+', label: '60+ y', maxMonths: Infinity },
] as const;

export type AgeBand = (typeof AGE_BANDS)[number]['code'];

export function ageBand(totalMonths: number): AgeBand {
  return (AGE_BANDS.find((b) => totalMonths < b.maxMonths) ?? AGE_BANDS[5]).code;
}
