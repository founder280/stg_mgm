import { useMemo, useState } from 'react';
import {
  BITE_TYPES,
  CASE_CATEGORIES,
  INJURY_TYPES,
  RESIDENCE_TYPES,
  ageInMonths,
  classifySyndromes,
  ONSET_PLACES,
  scoreTriage,
  walkInNameSchema,
  type BiteType,
} from '@mgms/shared';
import { useSync } from '../sync/SyncProvider';
import { CheckItem, NumberPad, Question, Segmented, Stepper, TripleNumber } from '../components/inputs';
import { AddressPicker, type AddressNode } from '../components/AddressPicker';

export interface RegistrationDraft {
  name: string;
  age: { years: number; months: number; days: number };
  gender: 'MALE' | 'FEMALE' | 'TRANSGENDER' | null;
  residenceType: 'HOME_STATE' | 'OTHER_STATE' | 'FOREIGNER';
  addressUnitId: string | null;
  addressText: string;
  daysAtResidence: number;
  mobile: string;
  festivalStay: { years: number; months: number; days: number };
  symptoms: Record<string, { onsetDays: number; onsetHours: number }>;
  caseCategories: string[];
  injuries: Array<{ injuryType: string; bodySite: string; lengthCm: number }>;
  bites: Array<{ biteType: BiteType; bodySite: string }>;
  otherSymptomText: string;
  onsetPlace: 'HOME' | 'FESTIVAL_AREA' | 'ENROUTE' | null;
  onsetZoneId: string | null;
}

export function emptyDraft(): RegistrationDraft {
  return {
    name: '',
    age: { years: 0, months: 0, days: 0 },
    gender: null,
    residenceType: 'HOME_STATE',
    addressUnitId: null,
    addressText: '',
    daysAtResidence: 0,
    mobile: '',
    festivalStay: { years: 0, months: 0, days: 1 },
    symptoms: {},
    caseCategories: [],
    injuries: [],
    bites: [],
    otherSymptomText: '',
    onsetPlace: null,
    onsetZoneId: null,
  };
}

const STEP_TITLES = [
  'Who is the walk-in?',
  'Where do they live?',
  'Contact and stay',
  'What are the symptoms?',
  'When and where did it start?',
];

interface Props {
  draft: RegistrationDraft;
  onChange: (draft: RegistrationDraft) => void;
  step: number;
  onStepChange: (step: number) => void;
  onComplete: () => void;
}

/** Screens 1 to 5 — the leg a volunteer or paramedic completes. */
export function RegistrationFlow({ draft, onChange, step, onStepChange, onComplete }: Props) {
  const { bundle } = useSync();
  const [touched, setTouched] = useState(false);

  const symptoms = bundle?.symptoms as Array<{ code: string; name: string; nameLocal: string | null; subFormat: string | null }> | undefined;
  const addressUnits = (bundle?.addressUnits ?? []) as AddressNode[];
  const zones = (bundle?.zones ?? []) as Array<{ id: string; name: string; parentId: string | null }>;
  const campDistrictId = (bundle?.camp as { districtId?: string } | undefined)?.districtId ?? '';

  const set = (patch: Partial<RegistrationDraft>) => onChange({ ...draft, ...patch });

  const nameError = useMemo(() => {
    if (!touched || draft.name === '') return null;
    const result = walkInNameSchema.safeParse(draft.name);
    return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid name');
  }, [draft.name, touched]);

  const ageError =
    touched && draft.age.years + draft.age.months + draft.age.days === 0
      ? 'Enter age in completed years, months or days'
      : null;

  const mobileError =
    touched && draft.mobile !== '' && !/^[6-9]\d{9}$/.test(draft.mobile)
      ? 'A mobile number is 10 digits starting 6, 7, 8 or 9'
      : null;

  const selectedSymptoms = Object.keys(draft.symptoms);

  function stepValid(index: number): boolean {
    switch (index) {
      case 0:
        return (
          walkInNameSchema.safeParse(draft.name).success &&
          draft.age.years + draft.age.months + draft.age.days > 0 &&
          draft.gender !== null
        );
      case 1:
        return draft.residenceType !== 'HOME_STATE' ? draft.addressText.trim().length > 0 : draft.addressUnitId !== null;
      case 2:
        return draft.mobile === '' || /^[6-9]\d{9}$/.test(draft.mobile);
      case 3:
        return selectedSymptoms.length > 0;
      case 4:
        return draft.onsetPlace !== null;
      default:
        return false;
    }
  }

  function next() {
    setTouched(true);
    if (!stepValid(step)) return;
    setTouched(false);
    if (step === 4) onComplete();
    else onStepChange(step + 1);
  }

  // Live classification, so the volunteer sees what the record will be counted
  // as before it is forwarded — and a red triage is visible immediately.
  const preview = useMemo(() => {
    if (selectedSymptoms.length === 0) return null;
    const totalMonths = ageInMonths(draft.age.years, draft.age.months, draft.age.days);
    const syndromeInput = {
      symptoms: Object.fromEntries(
        Object.entries(draft.symptoms).map(([code, onset]) => [code, onset.onsetDays * 24 + onset.onsetHours]),
      ),
      biteTypes: draft.bites.map((b) => b.biteType),
      hasInjury: draft.injuries.length > 0,
      ageMonths: totalMonths,
    };
    return {
      syndromes: classifySyndromes(syndromeInput),
      triage: scoreTriage({
        symptomCodes: selectedSymptoms,
        biteTypes: draft.bites.map((b) => b.biteType),
        caseCategories: draft.caseCategories as never,
        ageMonths: totalMonths,
      }),
    };
  }, [draft, selectedSymptoms]);

  return (
    <>
      <div className="step-head">
        <div className="step-num">Step {step + 1} of 5</div>
        <h2 className="step-title">{STEP_TITLES[step]}</h2>
        <div className="progress" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} className={i <= step ? 'done' : ''} />
          ))}
        </div>
      </div>

      {step === 0 && (
        <>
          <Question
            label="1. Name of the walk-in"
            help="Letters and spaces only, up to 50 characters. Stored in capital letters."
            error={nameError}
          >
            <input
              className={`text-input upper ${nameError ? 'invalid' : ''}`}
              value={draft.name}
              maxLength={50}
              autoCapitalize="characters"
              autoComplete="off"
              onChange={(e) => set({ name: e.target.value.replace(/[^A-Za-z ]/g, '') })}
              onBlur={() => setTouched(true)}
              aria-label="Name of the walk-in"
            />
          </Question>

          <Question
            label="2. Age in completed"
            help="Days for a newborn, months for an infant, years above one year."
            error={ageError}
          >
            <TripleNumber value={draft.age} onChange={(age) => set({ age })} />
          </Question>

          <Question label="3. Gender">
            <Segmented
              value={draft.gender}
              onChange={(gender) => set({ gender })}
              options={[
                { value: 'MALE' as const, label: 'Male' },
                { value: 'FEMALE' as const, label: 'Female' },
                { value: 'TRANSGENDER' as const, label: 'Transgender' },
              ]}
            />
          </Question>
        </>
      )}

      {step === 1 && (
        <>
          <Question label="4. Address of residence">
            <Segmented
              value={draft.residenceType}
              onChange={(residenceType) => set({ residenceType, addressUnitId: null, addressText: '' })}
              options={RESIDENCE_TYPES.map((type) => ({ value: type.code, label: type.name }))}
            />
          </Question>

          {draft.residenceType === 'HOME_STATE' ? (
            <Question
              label="Village or hamlet"
              help="Drill down from the district. The hamlet's geocode is what the surveillance analysis uses."
              error={touched && !draft.addressUnitId ? 'Select a village or hamlet' : null}
            >
              <AddressPicker
                units={addressUnits}
                rootId={campDistrictId}
                value={draft.addressUnitId}
                onChange={(unit) => set({ addressUnitId: unit?.id ?? null })}
              />
            </Question>
          ) : (
            <Question
              label={draft.residenceType === 'OTHER_STATE' ? 'State and district' : 'Country and city'}
              error={touched && !draft.addressText.trim() ? 'Enter where they live' : null}
            >
              <input
                className="text-input"
                value={draft.addressText}
                maxLength={240}
                onChange={(e) => set({ addressText: e.target.value })}
                aria-label="Address"
              />
            </Question>
          )}

          <Question label="Days already spent at this address" help="Helps identify temporary residents.">
            <Stepper
              ariaLabel="Days at this address"
              value={draft.daysAtResidence}
              max={36500}
              onChange={(daysAtResidence) => set({ daysAtResidence })}
            />
          </Question>
        </>
      )}

      {step === 2 && (
        <>
          <Question
            label="5. Mobile number"
            help="Optional. The prescription and an acknowledgement of participation are sent here."
            error={mobileError}
          >
            <NumberPad value={draft.mobile} onChange={(mobile) => set({ mobile })} length={10} ariaLabel="Mobile number" />
            <p className="small muted" style={{ textAlign: 'center', marginTop: 6 }}>
              Saved as +91 {draft.mobile || '—'}
            </p>
          </Question>

          <Question
            label="6. How long have they been in the festival area?"
            help="Correlated with the festival duration to separate pilgrims from local residents."
          >
            <TripleNumber
              value={draft.festivalStay}
              onChange={(festivalStay) => set({ festivalStay })}
              maxima={[50, 11, 30]}
            />
          </Question>
        </>
      )}

      {step === 3 && (
        <>
          <Question
            label="7. Symptoms present"
            help="Tick everything reported."
            error={touched && selectedSymptoms.length === 0 ? 'Select at least one symptom' : null}
          >
            <div className="checks">
              {symptoms?.map((symptom) => (
                <CheckItem
                  key={symptom.code}
                  label={symptom.name}
                  sublabel={symptom.nameLocal}
                  checked={symptom.code in draft.symptoms}
                  onToggle={() => {
                    const next = { ...draft.symptoms };
                    if (symptom.code in next) {
                      delete next[symptom.code];
                      set({
                        symptoms: next,
                        injuries: symptom.code === 'INJURY' ? [] : draft.injuries,
                        bites: symptom.code === 'BITE' ? [] : draft.bites,
                      });
                    } else {
                      // The spec's default onset is one day.
                      next[symptom.code] = { onsetDays: 1, onsetHours: 0 };
                      set({ symptoms: next });
                    }
                  }}
                />
              ))}
            </div>
          </Question>

          {'INJURY' in draft.symptoms && (
            <Question label="Injury detail" help="Mark the type and where it is.">
              <div className="seg" style={{ marginBottom: 10 }}>
                {INJURY_TYPES.map((type) => (
                  <button
                    key={type.code}
                    type="button"
                    aria-pressed={draft.injuries.some((i) => i.injuryType === type.code)}
                    onClick={() => {
                      const exists = draft.injuries.some((i) => i.injuryType === type.code);
                      set({
                        injuries: exists
                          ? draft.injuries.filter((i) => i.injuryType !== type.code)
                          : [...draft.injuries, { injuryType: type.code, bodySite: '', lengthCm: 0 }],
                      });
                    }}
                  >
                    {type.name} ({type.marker})
                  </button>
                ))}
              </div>
              {draft.injuries.map((injury, index) => (
                <input
                  key={injury.injuryType}
                  className="text-input"
                  style={{ marginBottom: 8 }}
                  placeholder={`Site of the ${injury.injuryType.toLowerCase()} — e.g. right knee`}
                  value={injury.bodySite}
                  onChange={(e) => {
                    const next = [...draft.injuries];
                    next[index] = { ...injury, bodySite: e.target.value };
                    set({ injuries: next });
                  }}
                  aria-label={`Site of the ${injury.injuryType.toLowerCase()}`}
                />
              ))}
            </Question>
          )}

          {'BITE' in draft.symptoms && (
            <Question label="Bite detail" help="Snake, scorpion, rabid and unknown bites are treated as critical.">
              <div className="checks">
                {BITE_TYPES.map((type) => (
                  <CheckItem
                    key={type.code}
                    label={type.name}
                    sublabel={type.critical ? 'critical pathway' : null}
                    checked={draft.bites.some((b) => b.biteType === type.code)}
                    onToggle={() => {
                      const exists = draft.bites.some((b) => b.biteType === type.code);
                      set({
                        bites: exists
                          ? draft.bites.filter((b) => b.biteType !== type.code)
                          : [...draft.bites, { biteType: type.code, bodySite: '' }],
                      });
                    }}
                  />
                ))}
              </div>
            </Question>
          )}

          {'OTHERS' in draft.symptoms && (
            <Question label="Other symptoms">
              <input
                className="text-input"
                value={draft.otherSymptomText}
                maxLength={240}
                onChange={(e) => set({ otherSymptomText: e.target.value })}
                aria-label="Other symptoms"
              />
            </Question>
          )}

          <Question label="Case category" help="Drives the referral pathway and the 108 ambulance escalation.">
            <div className="checks">
              {CASE_CATEGORIES.map((category) => (
                <CheckItem
                  key={category.code}
                  label={category.name}
                  sublabel={category.escalates ? 'escalates immediately' : null}
                  checked={draft.caseCategories.includes(category.code)}
                  onToggle={() =>
                    set({
                      caseCategories: draft.caseCategories.includes(category.code)
                        ? draft.caseCategories.filter((c) => c !== category.code)
                        : [...draft.caseCategories, category.code],
                    })
                  }
                />
              ))}
            </div>
          </Question>
        </>
      )}

      {step === 4 && (
        <>
          <Question
            label="8. Time of onset"
            help="Only the symptoms reported are listed. The default is one day."
          >
            {selectedSymptoms.map((code) => {
              const onset = draft.symptoms[code]!;
              const label = symptoms?.find((s) => s.code === code)?.name ?? code;
              return (
                <div key={code} style={{ marginBottom: 14 }}>
                  <div className="small" style={{ fontWeight: 650, marginBottom: 5 }}>{label}</div>
                  <div className="triple">
                    <div className="part">
                      <label>Days</label>
                      <Stepper
                        ariaLabel={`${label} onset days`}
                        value={onset.onsetDays}
                        max={365}
                        onChange={(onsetDays) => set({ symptoms: { ...draft.symptoms, [code]: { ...onset, onsetDays } } })}
                      />
                    </div>
                    <div className="part">
                      <label>Hours</label>
                      <Stepper
                        ariaLabel={`${label} onset hours`}
                        value={onset.onsetHours}
                        max={23}
                        onChange={(onsetHours) => set({ symptoms: { ...draft.symptoms, [code]: { ...onset, onsetHours } } })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </Question>

          <Question
            label="9. Place of onset"
            error={touched && !draft.onsetPlace ? 'Select where the symptoms began' : null}
          >
            <Segmented
              value={draft.onsetPlace}
              onChange={(onsetPlace) => set({ onsetPlace })}
              options={ONSET_PLACES.map((place) => ({ value: place.code, label: place.name }))}
            />
            <p className="small muted" style={{ marginTop: 6 }}>
              {ONSET_PLACES.find((p) => p.code === draft.onsetPlace)?.note ?? ''}
            </p>
          </Question>

          {draft.onsetPlace === 'FESTIVAL_AREA' && zones.length > 0 && (
            <Question label="Which part of the festival area?">
              <div className="pick-list">
                {zones
                  .filter((z) => z.parentId)
                  .map((zone) => (
                    <button
                      key={zone.id}
                      type="button"
                      className="pick"
                      aria-pressed={draft.onsetZoneId === zone.id}
                      onClick={() => set({ onsetZoneId: draft.onsetZoneId === zone.id ? null : zone.id })}
                    >
                      {zone.name}
                    </button>
                  ))}
              </div>
            </Question>
          )}

          {preview && (
            <div className="suggest">
              <h4>This will be recorded as</h4>
              <p>
                <strong>{preview.syndromes[0]?.name ?? 'No IDSP syndrome matched'}</strong>
                {preview.syndromes[0] && ` — ${preview.syndromes[0].reference}`}
              </p>
              <p style={{ marginTop: 5 }}>
                Triage{' '}
                <span className={`pill ${preview.triage.level === 'RED' ? 'red' : preview.triage.level === 'ORANGE' ? 'orange' : preview.triage.level === 'YELLOW' ? 'amber' : 'green'}`}>
                  {preview.triage.level}
                </span>
                {preview.triage.requiresAmbulance && ' · call 108 now'}
              </p>
              {preview.triage.reasons.length > 0 && (
                <p className="small" style={{ marginTop: 5 }}>{preview.triage.reasons.join(' · ')}</p>
              )}
            </div>
          )}
        </>
      )}

      <div className="actions">
        {step > 0 && (
          <button type="button" className="btn" onClick={() => onStepChange(step - 1)}>
            Back
          </button>
        )}
        <button type="button" className="btn primary" onClick={next}>
          {step === 4 ? 'Review and forward' : 'Next'}
        </button>
      </div>
    </>
  );
}
