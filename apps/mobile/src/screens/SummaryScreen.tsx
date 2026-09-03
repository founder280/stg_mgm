import { classifySyndromes } from '@mgms/shared';
import type { LocalWalkIn } from '../db/queue';

function triageClass(level?: string) {
  return level === 'RED' ? 'red' : level === 'ORANGE' ? 'orange' : level === 'YELLOW' ? 'amber' : 'green';
}

/** "Summary" — the whole record on one screen, for the current walk-in. */
export function SummaryScreen({ walkIn, onBack }: { walkIn: LocalWalkIn | null; onBack: () => void }) {
  if (!walkIn) {
    return (
      <div className="empty">
        <p>No walk-in is open. Open one from the waiting list or register a new one.</p>
        <button type="button" className="btn" onClick={onBack} style={{ marginTop: 12 }}>
          Back
        </button>
      </div>
    );
  }

  const registration = walkIn.registration;
  const syndromes = classifySyndromes({
    symptoms: Object.fromEntries(
      Object.entries(registration.symptoms ?? {}).map(([code, onset]) => [
        code,
        (onset as { onsetDays: number; onsetHours: number }).onsetDays * 24 +
          (onset as { onsetDays: number; onsetHours: number }).onsetHours,
      ]),
    ),
    hasInjury: (registration.injuries ?? []).length > 0,
    biteTypes: (registration.bites ?? []).map((b) => b.biteType) as never,
    ageMonths: walkIn.ageYears * 12,
  });

  return (
    <>
      <div className="step-head">
        <div className="step-num">Summary</div>
        <h2 className="step-title">{walkIn.name}</h2>
        <div className="step-hint">
          {walkIn.tokenNumber ?? 'Token allocated on sync'} · {walkIn.synced ? 'synced' : 'queued on this device'}
        </div>
      </div>

      <div className="card">
        <h3>Identity</h3>
        <div className="rows">
          <div className="rowline"><span className="k">Age</span><span className="v">{walkIn.ageYears} years</span></div>
          <div className="rowline"><span className="k">Gender</span><span className="v">{walkIn.gender.toLowerCase()}</span></div>
          <div className="rowline"><span className="k">Mobile</span><span className="v mono">{registration.mobile ?? '—'}</span></div>
          <div className="rowline">
            <span className="k">Stay at the festival</span>
            <span className="v">
              {registration.festivalStay.years * 365 + registration.festivalStay.months * 30 + registration.festivalStay.days} days
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Presentation</h3>
        <div className="rows">
          <div className="rowline">
            <span className="k">Symptoms</span>
            <span className="v">{walkIn.symptomCodes.join(', ').toLowerCase() || '—'}</span>
          </div>
          <div className="rowline">
            <span className="k">Triage</span>
            <span className="v">
              <span className={`pill ${triageClass(walkIn.triageLevel)}`}>{walkIn.triageLevel ?? 'GREEN'}</span>
            </span>
          </div>
          <div className="rowline">
            <span className="k">Syndrome</span>
            <span className="v">{syndromes[0]?.name ?? 'Unclassified'}</span>
          </div>
          {syndromes[0] && (
            <p className="small muted" style={{ margin: 0 }}>{syndromes[0].reference}</p>
          )}
        </div>
      </div>

      {walkIn.vitals && (
        <div className="card">
          <h3>Measurements</h3>
          <div className="rows">
            <div className="rowline"><span className="k">Weight / height</span><span className="v">{walkIn.vitals.weightKg ?? '—'} kg · {walkIn.vitals.heightCm ?? '—'} cm</span></div>
            <div className="rowline"><span className="k">Blood pressure</span><span className="v">{walkIn.vitals.systolic ?? '—'}/{walkIn.vitals.diastolic ?? '—'} mmHg</span></div>
            <div className="rowline"><span className="k">Pulse</span><span className="v">{walkIn.vitals.pulse ?? '—'} /min</span></div>
            <div className="rowline"><span className="k">Temperature</span><span className="v">{walkIn.vitals.temperatureF ?? '—'} °F</span></div>
          </div>
        </div>
      )}

      {walkIn.clinical && (
        <div className="card">
          <h3>Treatment</h3>
          <div className="rows">
            <div className="rowline">
              <span className="k">Diagnosis</span>
              <span className="v">{walkIn.clinical.provisionalDiagnosis || '—'}</span>
            </div>
            <div className="rowline">
              <span className="k">Laboratory</span>
              <span className="v">{walkIn.clinical.labOrder?.status.replace(/_/g, ' ').toLowerCase() ?? 'not advised'}</span>
            </div>
            {(walkIn.clinical.prescriptions ?? []).map((line) => (
              <div className="rowline" key={line.drugName}>
                <span className="k">{line.drugName}</span>
                <span className="v">{line.dosagePattern} · {line.days} d · {line.quantity} units</span>
              </div>
            ))}
            {walkIn.clinical.referral?.required && (
              <div className="rowline">
                <span className="k">Referral</span>
                <span className="v">
                  {walkIn.clinical.referral.ambulanceRequested ? '108 ambulance requested' : 'own transport'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Record provenance</h3>
        <div className="rows">
          <div className="rowline"><span className="k">Form</span><span className="v">{registration.capture.formName} v{registration.capture.formVersion}</span></div>
          <div className="rowline"><span className="k">Device</span><span className="v mono">{registration.capture.deviceId}</span></div>
          <div className="rowline"><span className="k">Instance</span><span className="v mono small">{String(registration.capture.instanceId).slice(0, 13)}…</span></div>
          <div className="rowline"><span className="k">Registered</span><span className="v">{new Date(walkIn.registeredAt).toLocaleString()}</span></div>
        </div>
      </div>

      <div className="actions">
        <button type="button" className="btn block" onClick={onBack}>
          Back
        </button>
      </div>
    </>
  );
}
