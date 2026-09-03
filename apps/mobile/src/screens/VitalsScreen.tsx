import { useMemo, useState } from 'react';
import { deriveVitals, scoreTriage } from '@mgms/shared';
import type { LocalWalkIn } from '../db/queue';
import { Question, Stepper } from '../components/inputs';

export interface VitalsDraft {
  weightKg: number;
  heightCm: number;
  systolic: number;
  diastolic: number;
  pulse: number;
  temperatureF: number;
}

export function emptyVitals(): VitalsDraft {
  return { weightKg: 0, heightCm: 0, systolic: 0, diastolic: 0, pulse: 0, temperatureF: 0 };
}

/** Screen 6 — measurements. Every field is optional, per the form. */
export function VitalsScreen({
  walkIn,
  draft,
  onChange,
  onSave,
  saving,
}: {
  walkIn: LocalWalkIn;
  draft: VitalsDraft;
  onChange: (draft: VitalsDraft) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [temperatureText, setTemperatureText] = useState(draft.temperatureF ? String(draft.temperatureF) : '');
  const set = (patch: Partial<VitalsDraft>) => onChange({ ...draft, ...patch });

  // Zero means "not measured", which is different from a measured zero.
  const asValue = (n: number) => (n > 0 ? n : null);

  const derived = useMemo(
    () =>
      deriveVitals({
        weightKg: asValue(draft.weightKg),
        heightCm: asValue(draft.heightCm),
        systolic: asValue(draft.systolic),
        diastolic: asValue(draft.diastolic),
        pulse: asValue(draft.pulse),
        temperatureF: asValue(draft.temperatureF),
      }),
    [draft],
  );

  const triage = useMemo(
    () =>
      scoreTriage({
        weightKg: asValue(draft.weightKg),
        heightCm: asValue(draft.heightCm),
        systolic: asValue(draft.systolic),
        diastolic: asValue(draft.diastolic),
        pulse: asValue(draft.pulse),
        temperatureF: asValue(draft.temperatureF),
        symptomCodes: walkIn.symptomCodes,
        caseCategories: walkIn.registration.caseCategories as never,
        ageMonths: walkIn.ageYears * 12,
      }),
    [draft, walkIn],
  );

  return (
    <>
      <div className="step-head">
        <div className="step-num">Screen 6 · Paramedic</div>
        <h2 className="step-title">Measurements</h2>
        <div className="step-hint">
          {walkIn.name} · {walkIn.ageYears} y · token {walkIn.tokenNumber ?? 'pending sync'}
        </div>
      </div>

      <p className="small muted" style={{ marginTop: -6, marginBottom: 16 }}>
        All optional — leave anything not measured at zero.
      </p>

      <Question label="Weight (kg)">
        <Stepper ariaLabel="Weight in kilograms" value={draft.weightKg} max={300} onChange={(weightKg) => set({ weightKg })} />
      </Question>

      <Question label="Height (cm)">
        <Stepper ariaLabel="Height in centimetres" value={draft.heightCm} max={250} onChange={(heightCm) => set({ heightCm })} />
      </Question>

      <Question label="Blood pressure (mmHg)">
        <div className="triple">
          <div className="part">
            <label>Systolic</label>
            <Stepper ariaLabel="Systolic" value={draft.systolic} max={300} onChange={(systolic) => set({ systolic })} />
          </div>
          <div className="part">
            <label>Diastolic</label>
            <Stepper ariaLabel="Diastolic" value={draft.diastolic} max={200} onChange={(diastolic) => set({ diastolic })} />
          </div>
        </div>
      </Question>

      <Question label="Pulse rate (per minute)">
        <Stepper ariaLabel="Pulse rate" value={draft.pulse} max={250} onChange={(pulse) => set({ pulse })} />
      </Question>

      <Question label="Temperature (°F)">
        <input
          className="text-input"
          inputMode="decimal"
          value={temperatureText}
          placeholder="98.6"
          onChange={(e) => {
            const text = e.target.value.replace(/[^0-9.]/g, '');
            setTemperatureText(text);
            const parsed = Number(text);
            set({ temperatureF: Number.isFinite(parsed) ? parsed : 0 });
          }}
          aria-label="Temperature in Fahrenheit"
        />
      </Question>

      {(derived.bmi != null || derived.bpStage != null || triage.level !== 'GREEN') && (
        <div className="suggest">
          <h4>Derived</h4>
          {derived.bmi != null && (
            <p>
              BMI <strong>{derived.bmi}</strong> · {derived.bmiCategory?.toLowerCase()}
            </p>
          )}
          {derived.bpStage && (
            <p>
              Blood pressure <strong>{derived.bpStage.replace(/_/g, ' ').toLowerCase()}</strong>
              {derived.newlyDetectedHypertension && ' — newly detected hypertension, refer for confirmation'}
            </p>
          )}
          <p style={{ marginTop: 5 }}>
            Triage{' '}
            <span className={`pill ${triage.level === 'RED' ? 'red' : triage.level === 'ORANGE' ? 'orange' : triage.level === 'YELLOW' ? 'amber' : 'green'}`}>
              {triage.level}
            </span>
            {triage.requiresAmbulance && ' · call 108 and alert the coordinator now'}
          </p>
          {triage.reasons.length > 0 && <p className="small" style={{ marginTop: 4 }}>{triage.reasons.join(' · ')}</p>}
        </div>
      )}

      <div className="actions">
        <button type="button" className="btn primary block" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Forward to the medical officer'}
        </button>
      </div>
    </>
  );
}
