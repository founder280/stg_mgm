import { describe, expect, it } from 'vitest';
import { scoreTriage } from '../src/clinical/triage.js';
import { bloodPressureStage, calculateBmi, deriveVitals, ageBand, ageInMonths } from '../src/clinical/vitals.js';

describe('triage scoring', () => {
  it('keeps a well adult with mild symptoms green', () => {
    const result = scoreTriage({ symptomCodes: ['HEADACHE'], ageMonths: 360 });
    expect(result.level).toBe('GREEN');
    expect(result.requiresAmbulance).toBe(false);
  });

  it('escalates a critically ill marking to red with an ambulance', () => {
    const result = scoreTriage({ symptomCodes: ['SOB'], caseCategories: ['CRITICALLY_ILL'], ageMonths: 400 });
    expect(result.level).toBe('RED');
    expect(result.requiresAmbulance).toBe(true);
    expect(result.reasons).toContain('Marked critically ill at registration');
  });

  it('escalates a snake bite even with normal vitals', () => {
    const result = scoreTriage({ symptomCodes: [], biteTypes: ['SNAKE'], ageMonths: 300 });
    expect(result.score).toBeGreaterThanOrEqual(6);
    expect(['ORANGE', 'RED']).toContain(result.level);
  });

  it('adds points for hypotension and tachycardia', () => {
    const result = scoreTriage({ symptomCodes: [], systolic: 84, diastolic: 56, pulse: 130, ageMonths: 300 });
    expect(result.reasons).toContain('Hypotension (systolic < 90 mmHg)');
    expect(result.reasons).toContain('Tachycardia (> 120/min)');
    expect(result.level).toBe('ORANGE');
  });

  it('weights the extremes of age', () => {
    const child = scoreTriage({ symptomCodes: ['DEHYDRATION'], ageMonths: 24 });
    const adult = scoreTriage({ symptomCodes: ['DEHYDRATION'], ageMonths: 300 });
    expect(child.score).toBeGreaterThan(adult.score);
  });
});

describe('vitals derivations', () => {
  it('computes BMI to one decimal place', () => {
    expect(calculateBmi(70, 170)).toBe(24.2);
    expect(calculateBmi(null, 170)).toBeNull();
    expect(calculateBmi(70, 0)).toBeNull();
  });

  it('stages blood pressure and flags newly detected hypertension', () => {
    expect(bloodPressureStage(118, 76)).toBe('NORMAL');
    expect(bloodPressureStage(134, 84)).toBe('STAGE_1');
    expect(bloodPressureStage(150, 95)).toBe('STAGE_2');
    expect(bloodPressureStage(190, 125)).toBe('CRISIS');

    expect(deriveVitals({ systolic: 150, diastolic: 95 }).newlyDetectedHypertension).toBe(true);
    expect(deriveVitals({ systolic: 118, diastolic: 76 }).newlyDetectedHypertension).toBe(false);
  });

  it('bands ages from the three-part age control', () => {
    expect(ageBand(ageInMonths(0, 6, 0))).toBe('0-4');
    expect(ageBand(ageInMonths(30, 0, 0))).toBe('25-44');
    expect(ageBand(ageInMonths(72, 0, 0))).toBe('60+');
  });
});
