import { useMemo, useState } from 'react';
import {
  DOSAGE_PATTERNS,
  LAB_ORDER_STATUSES,
  SAMPLE_TYPES,
  classifySyndromes,
  suggestSamples,
  suggestTreatment,
  unitsRequired,
} from '@mgms/shared';
import { useSync } from '../sync/SyncProvider';
import type { LocalWalkIn } from '../db/queue';
import { CheckItem, Question, Segmented, Stepper } from '../components/inputs';

export interface PrescriptionDraft {
  drugId: string;
  drugCode: string;
  drugName: string;
  form: string;
  dosagePattern: string;
  days: number;
  quantity: number;
}

export interface ClinicalDraft {
  provisionalDiagnosis: string;
  labStatus: 'NOT_ADVISED' | 'ADVISED_REFERRED' | 'SAMPLE_COLLECTED';
  samples: string[];
  labelId: string;
  prescriptions: PrescriptionDraft[];
  dressingPerformed: boolean;
  dressingNotes: string;
  advice: string;
  referralRequired: boolean;
  referralFacilityId: string | null;
  ambulanceRequested: boolean;
  referralReason: string;
}

export function emptyClinical(): ClinicalDraft {
  return {
    provisionalDiagnosis: '',
    // The spec makes "Not advised" the default.
    labStatus: 'NOT_ADVISED',
    samples: [],
    labelId: '',
    prescriptions: [],
    dressingPerformed: false,
    dressingNotes: '',
    advice: '',
    referralRequired: false,
    referralFacilityId: null,
    ambulanceRequested: false,
    referralReason: '',
  };
}

interface InventoryRow {
  drugId: string;
  onHand: number;
  drug: { code: string; name: string; form: string };
}

/** Screens 7 to 9 — laboratory, treatment and dressing, by the medical officer. */
export function ClinicalScreen({
  walkIn,
  draft,
  onChange,
  onSave,
  saving,
}: {
  walkIn: LocalWalkIn;
  draft: ClinicalDraft;
  onChange: (draft: ClinicalDraft) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { bundle } = useSync();
  const [drugQuery, setDrugQuery] = useState('');

  const inventory = (bundle?.inventory ?? []) as InventoryRow[];
  const facilities = (bundle?.referralFacilities ?? []) as Array<{ id: string; name: string; type: string; specialities: string[] }>;

  const set = (patch: Partial<ClinicalDraft>) => onChange({ ...draft, ...patch });

  const syndromes = useMemo(
    () =>
      classifySyndromes({
        symptoms: Object.fromEntries(
          Object.entries(walkIn.registration.symptoms ?? {}).map(([code, onset]) => [
            code,
            (onset as { onsetDays: number; onsetHours: number }).onsetDays * 24 +
              (onset as { onsetDays: number; onsetHours: number }).onsetHours,
          ]),
        ),
        hasInjury: (walkIn.registration.injuries ?? []).length > 0,
        biteTypes: (walkIn.registration.bites ?? []).map((b) => b.biteType) as never,
        ageMonths: walkIn.ageYears * 12,
      }),
    [walkIn],
  );

  const sampleSuggestions = useMemo(
    () => suggestSamples(syndromes.map((s) => s.code), walkIn.symptomCodes),
    [syndromes, walkIn.symptomCodes],
  );

  const protocol = useMemo(
    () =>
      suggestTreatment(
        syndromes[0]?.code ?? null,
        inventory.map((row) => ({ drugCode: row.drug.code, availableQuantity: row.onHand })),
      ),
    [syndromes, inventory],
  );

  const stocked = inventory.filter(
    (row) => row.onHand > 0 && row.drug.name.toLowerCase().includes(drugQuery.trim().toLowerCase()),
  );

  function addDrug(row: InventoryRow, pattern = '1-0-1', days = 3) {
    if (draft.prescriptions.some((p) => p.drugId === row.drugId)) return;
    set({
      prescriptions: [
        ...draft.prescriptions,
        {
          drugId: row.drugId,
          drugCode: row.drug.code,
          drugName: row.drug.name,
          form: row.drug.form,
          dosagePattern: pattern,
          days,
          quantity: unitsRequired(pattern, days),
        },
      ],
    });
    setDrugQuery('');
  }

  function applyProtocol() {
    if (!protocol) return;
    for (const line of protocol.lines) {
      const row = inventory.find((i) => i.drug.code === line.drugCode && i.onHand > 0);
      if (row) addDrug(row, line.dosagePattern, line.days);
    }
    if (protocol.advice.length > 0 && !draft.advice) set({ advice: protocol.advice.join('. ') });
  }

  return (
    <>
      <div className="step-head">
        <div className="step-num">Screens 7–9 · Medical officer</div>
        <h2 className="step-title">Investigations and treatment</h2>
        <div className="step-hint">
          {walkIn.name} · {walkIn.ageYears} y · token {walkIn.tokenNumber ?? 'pending sync'}
        </div>
      </div>

      {syndromes[0] && (
        <div className="suggest">
          <h4>Syndrome classification</h4>
          <p>
            <strong>{syndromes[0].name}</strong> — {syndromes[0].caseDefinition}
          </p>
          <p className="small muted" style={{ marginTop: 4 }}>{syndromes[0].reference}</p>
        </div>
      )}

      <Question label="Provisional diagnosis">
        <input
          className="text-input"
          value={draft.provisionalDiagnosis}
          maxLength={240}
          placeholder={syndromes[0]?.name ?? 'Clinical impression'}
          onChange={(e) => set({ provisionalDiagnosis: e.target.value })}
          aria-label="Provisional diagnosis"
        />
      </Question>

      <Question label="11. Laboratory investigations">
        <Segmented
          value={draft.labStatus}
          onChange={(labStatus) => set({ labStatus, samples: labStatus === 'NOT_ADVISED' ? [] : draft.samples })}
          options={LAB_ORDER_STATUSES.map((status) => ({
            value: status,
            label: status === 'NOT_ADVISED' ? 'Not advised' : status === 'ADVISED_REFERRED' ? 'Advised & referred' : 'Sample collected',
          }))}
        />
      </Question>

      {draft.labStatus !== 'NOT_ADVISED' && (
        <>
          {sampleSuggestions.length > 0 && (
            <div className="suggest">
              <h4>Suggested for this presentation</h4>
              {sampleSuggestions.map((suggestion) => (
                <p key={suggestion.sample} className="small">
                  <strong>{SAMPLE_TYPES.find((s) => s.code === suggestion.sample)?.name}</strong> — {suggestion.reason}
                </p>
              ))}
              <button
                type="button"
                className="btn small"
                style={{ marginTop: 8 }}
                onClick={() => set({ samples: [...new Set([...draft.samples, ...sampleSuggestions.map((s) => s.sample)])] })}
              >
                Add all suggested
              </button>
            </div>
          )}

          <Question label="Samples">
            <div className="checks">
              {SAMPLE_TYPES.map((sample) => (
                <CheckItem
                  key={sample.code}
                  label={sample.name}
                  checked={draft.samples.includes(sample.code)}
                  onToggle={() =>
                    set({
                      samples: draft.samples.includes(sample.code)
                        ? draft.samples.filter((s) => s !== sample.code)
                        : [...draft.samples, sample.code],
                    })
                  }
                />
              ))}
            </div>
          </Question>

          {draft.labStatus === 'SAMPLE_COLLECTED' && (
            <Question label="Label number" help="Labelling is done at the camp site; the transport manifest is keyed on this.">
              <input
                className="text-input"
                value={draft.labelId}
                maxLength={40}
                onChange={(e) => set({ labelId: e.target.value.toUpperCase() })}
                aria-label="Sample label number"
              />
            </Question>
          )}
        </>
      )}

      <Question label="12. Treatment given" help="Only drugs the camp actually holds are offered.">
        {protocol && (
          <div className="suggest">
            <h4>Standard protocol: {protocol.name}</h4>
            <p className="small">{protocol.reference}</p>
            {protocol.unavailableDrugCodes.length > 0 && (
              <p className="small" style={{ marginTop: 4 }}>
                Not in stock here: {protocol.unavailableDrugCodes.join(', ')} — substitute manually.
              </p>
            )}
            <button type="button" className="btn small" style={{ marginTop: 8 }} onClick={applyProtocol}>
              Apply the protocol
            </button>
          </div>
        )}

        {draft.prescriptions.map((line, index) => (
          <div className="card" key={line.drugId}>
            <div className="rowline">
              <span className="v" style={{ textAlign: 'left' }}>{line.drugName}</span>
              <button
                type="button"
                className="btn small"
                onClick={() => set({ prescriptions: draft.prescriptions.filter((_, i) => i !== index) })}
              >
                Remove
              </button>
            </div>

            <div className="triple" style={{ marginTop: 8 }}>
              <div className="part">
                <label htmlFor={`dose-${line.drugId}`}>Dosage</label>
                <select
                  id={`dose-${line.drugId}`}
                  className="text-input"
                  value={line.dosagePattern}
                  onChange={(e) => {
                    const next = [...draft.prescriptions];
                    next[index] = {
                      ...line,
                      dosagePattern: e.target.value,
                      quantity: unitsRequired(e.target.value, line.days),
                    };
                    set({ prescriptions: next });
                  }}
                >
                  {DOSAGE_PATTERNS.map((pattern) => (
                    <option key={pattern.code} value={pattern.code}>{pattern.label}</option>
                  ))}
                </select>
              </div>
              <div className="part">
                <label>Days</label>
                <Stepper
                  ariaLabel={`${line.drugName} days`}
                  value={line.days}
                  min={1}
                  max={30}
                  onChange={(days) => {
                    const next = [...draft.prescriptions];
                    next[index] = { ...line, days, quantity: unitsRequired(line.dosagePattern, days) };
                    set({ prescriptions: next });
                  }}
                />
              </div>
              <div className="part">
                <label>Units</label>
                <Stepper
                  ariaLabel={`${line.drugName} units`}
                  value={line.quantity}
                  min={1}
                  max={500}
                  onChange={(quantity) => {
                    const next = [...draft.prescriptions];
                    next[index] = { ...line, quantity };
                    set({ prescriptions: next });
                  }}
                />
              </div>
            </div>
          </div>
        ))}

        <input
          className="text-input"
          placeholder="Search the camp's drug stock"
          value={drugQuery}
          onChange={(e) => setDrugQuery(e.target.value)}
          aria-label="Search drugs"
        />
        {drugQuery.trim() && (
          <div className="pick-list" style={{ marginTop: 8 }}>
            {stocked.slice(0, 10).map((row) => (
              <button key={row.drugId} type="button" className="pick" onClick={() => addDrug(row)}>
                <span>{row.drug.name}</span>
                <span className="lvl">{row.onHand} in stock</span>
              </button>
            ))}
            {stocked.length === 0 && <p className="small muted">Nothing in stock matches that name.</p>}
          </div>
        )}
      </Question>

      <Question label="13. Cleaning and dressing">
        <Segmented
          value={draft.dressingPerformed ? 'YES' : 'NO'}
          onChange={(value) => set({ dressingPerformed: value === 'YES' })}
          options={[
            { value: 'NO', label: 'Not required' },
            { value: 'YES', label: 'Done' },
          ]}
        />
        {draft.dressingPerformed && (
          <textarea
            className="text-input"
            style={{ marginTop: 10, minHeight: 84 }}
            placeholder="Injury details and advice for review"
            value={draft.dressingNotes}
            maxLength={1000}
            onChange={(e) => set({ dressingNotes: e.target.value })}
            aria-label="Dressing notes"
          />
        )}
      </Question>

      <Question label="Referral">
        <Segmented
          value={draft.referralRequired ? 'YES' : 'NO'}
          onChange={(value) => set({ referralRequired: value === 'YES' })}
          options={[
            { value: 'NO', label: 'Not required' },
            { value: 'YES', label: 'Refer' },
          ]}
        />

        {draft.referralRequired && (
          <>
            <div className="pick-list" style={{ marginTop: 10 }}>
              {facilities
                .filter((f) => f.type !== 'LABORATORY')
                .map((facility) => (
                  <button
                    key={facility.id}
                    type="button"
                    className="pick"
                    aria-pressed={draft.referralFacilityId === facility.id}
                    onClick={() => set({ referralFacilityId: facility.id })}
                  >
                    <span>{facility.name}</span>
                    <span className="lvl">{facility.specialities.slice(0, 2).join(', ').toLowerCase()}</span>
                  </button>
                ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <CheckItem
                label="Request a 108 ambulance"
                sublabel="Alerts the control room coordinator"
                checked={draft.ambulanceRequested}
                onToggle={() => set({ ambulanceRequested: !draft.ambulanceRequested })}
              />
            </div>

            <input
              className="text-input"
              style={{ marginTop: 10 }}
              placeholder="Reason for referral"
              value={draft.referralReason}
              maxLength={500}
              onChange={(e) => set({ referralReason: e.target.value })}
              aria-label="Reason for referral"
            />
          </>
        )}
      </Question>

      <Question label="Advice">
        <textarea
          className="text-input"
          style={{ minHeight: 74 }}
          value={draft.advice}
          maxLength={1000}
          onChange={(e) => set({ advice: e.target.value })}
          aria-label="Advice"
        />
      </Question>

      <div className="actions">
        <button type="button" className="btn primary block" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : draft.referralRequired ? 'Refer and close' : 'Complete consultation'}
        </button>
      </div>
    </>
  );
}
