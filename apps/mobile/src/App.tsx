import { useCallback, useEffect, useMemo, useState } from 'react';
import { ageInMonths, classifySyndromes, scoreTriage, type RegistrationInput } from '@mgms/shared';
import { useSync } from './sync/SyncProvider';
import { IS_DEMO } from './api/transport';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { RegistrationFlow, emptyDraft, type RegistrationDraft } from './screens/RegistrationFlow';
import { VitalsScreen, emptyVitals, type VitalsDraft } from './screens/VitalsScreen';
import { ClinicalScreen, emptyClinical, type ClinicalDraft } from './screens/ClinicalScreen';
import { WaitingListScreen } from './screens/WaitingListScreen';
import { SummaryScreen } from './screens/SummaryScreen';
import { BottomBar } from './components/BottomBar';
import { buildCapture, currentPosition, serialiseCapture } from './capture';
import { enqueue, listWalkIns, saveWalkIn, updateWalkIn, type LocalWalkIn } from './db/queue';

type View = 'home' | 'register' | 'vitals' | 'clinical' | 'waiting' | 'summary';

export function App() {
  const sync = useSync();
  const { session, status, bundle, online, deviceId, pendingCount, reloadCounts } = sync;

  const [view, setView] = useState<View>('home');
  const [walkIns, setWalkIns] = useState<LocalWalkIn[]>([]);
  const [current, setCurrent] = useState<LocalWalkIn | null>(null);
  const [draft, setDraft] = useState<RegistrationDraft>(emptyDraft);
  const [step, setStep] = useState(0);
  const [vitals, setVitals] = useState<VitalsDraft>(emptyVitals);
  const [clinical, setClinical] = useState<ClinicalDraft>(emptyClinical);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setWalkIns(await listWalkIns());
    await reloadCounts();
  }, [reloadCounts]);

  useEffect(() => {
    if (status === 'signed-in') void refresh();
  }, [status, refresh]);

  const waitingCount = useMemo(
    () => walkIns.filter((w) => w.stage === 'REGISTERED' || w.stage === 'VITALS_DONE').length,
    [walkIns],
  );

  const campId = (bundle?.camp as { id?: string } | undefined)?.id ?? session?.scope.campIds[0] ?? '';

  function startNew() {
    setDraft(emptyDraft());
    setStep(0);
    setCurrent(null);
    setStartedAt(Date.now());
    setNotice(null);
    setView('register');
  }

  /** Screens 1-5 — write the registration to the outbox and hand it forward. */
  async function saveRegistration() {
    if (!session || !campId) return;
    setSaving(true);
    try {
      const clientId = crypto.randomUUID();
      const capture = buildCapture({
        username: session.username,
        deviceId,
        loginTime: session.loginTime,
        startedAt,
      });
      const location = await currentPosition();

      const symptomEntries = Object.entries(draft.symptoms).map(([symptomCode, onset]) => ({
        symptomCode,
        onsetDays: onset.onsetDays,
        onsetHours: onset.onsetHours,
      }));

      const payload = {
        campId,
        name: draft.name.toUpperCase().replace(/\s+/g, ' ').trim(),
        age: draft.age,
        gender: draft.gender!,
        residence: {
          residenceType: draft.residenceType,
          addressUnitId: draft.addressUnitId,
          addressText: draft.addressText || undefined,
          countryCode: draft.residenceType === 'FOREIGNER' ? undefined : 'IN',
          daysAtResidence: draft.daysAtResidence,
        },
        mobile: draft.mobile ? `+91${draft.mobile}` : undefined,
        festivalStay: draft.festivalStay,
        symptoms: symptomEntries,
        caseCategories: draft.caseCategories,
        injuries: draft.injuries.map((i) => ({
          injuryType: i.injuryType,
          bodySite: i.bodySite || undefined,
          lengthCm: i.lengthCm || undefined,
        })),
        bites: draft.bites.map((b) => ({ biteType: b.biteType, bodySite: b.bodySite || undefined })),
        otherSymptomText: draft.otherSymptomText || undefined,
        onsetPlace: draft.onsetPlace!,
        onsetZoneId: draft.onsetZoneId,
        location: location ?? undefined,
        capture: serialiseCapture(capture),
      } as unknown as RegistrationInput;

      const totalMonths = ageInMonths(draft.age.years, draft.age.months, draft.age.days);
      const syndromes = classifySyndromes({
        symptoms: Object.fromEntries(symptomEntries.map((s) => [s.symptomCode, s.onsetDays * 24 + s.onsetHours])),
        biteTypes: draft.bites.map((b) => b.biteType),
        hasInjury: draft.injuries.length > 0,
        ageMonths: totalMonths,
      });
      const triage = scoreTriage({
        symptomCodes: symptomEntries.map((s) => s.symptomCode),
        biteTypes: draft.bites.map((b) => b.biteType),
        caseCategories: draft.caseCategories as never,
        ageMonths: totalMonths,
      });

      const walkIn: LocalWalkIn = {
        clientId,
        name: payload.name,
        ageYears: draft.age.years,
        gender: draft.gender!,
        stage: 'REGISTERED',
        triageLevel: triage.level,
        primarySyndromeCode: syndromes[0]?.code,
        symptomCodes: symptomEntries.map((s) => s.symptomCode),
        registeredAt: new Date().toISOString(),
        registration: { ...payload, symptoms: draft.symptoms } as unknown as RegistrationInput,
        synced: false,
      };

      // Local first, network second: the record is durable before anything
      // touches the wire, so a dropped connection cannot lose a patient.
      await saveWalkIn(walkIn);
      await enqueue({
        clientId,
        kind: 'REGISTRATION',
        payload,
        queuedAt: new Date().toISOString(),
        status: 'PENDING',
        attempts: 0,
      });

      await refresh();
      setCurrent(walkIn);
      setNotice(
        triage.requiresAmbulance
          ? `${walkIn.name} triaged RED — call 108 and alert the coordinator now.`
          : `${walkIn.name} registered and forwarded${online ? '' : ' — queued until this device is back online'}.`,
      );
      setView('vitals');
      setVitals(emptyVitals());
      setStartedAt(Date.now());
      void sync.sync();
    } finally {
      setSaving(false);
    }
  }

  /** Screen 6. */
  async function saveVitals() {
    if (!session || !current) return;
    setSaving(true);
    try {
      const clientId = crypto.randomUUID();
      const capture = buildCapture({ username: session.username, deviceId, loginTime: session.loginTime, startedAt });
      const value = (n: number) => (n > 0 ? n : null);

      const payload = {
        weightKg: value(vitals.weightKg),
        heightCm: value(vitals.heightCm),
        systolic: value(vitals.systolic),
        diastolic: value(vitals.diastolic),
        pulse: value(vitals.pulse),
        temperatureF: value(vitals.temperatureF),
        capture: serialiseCapture(capture),
      };

      await enqueue({
        clientId,
        kind: 'VITALS',
        walkInClientId: current.clientId,
        walkInId: current.serverId,
        payload: payload as never,
        queuedAt: new Date().toISOString(),
        status: 'PENDING',
        attempts: 0,
      });
      await updateWalkIn(current.clientId, { stage: 'VITALS_DONE', vitals: payload as never, synced: false });

      await refresh();
      const updated = (await listWalkIns()).find((w) => w.clientId === current.clientId) ?? null;
      setCurrent(updated);
      setClinical(emptyClinical());
      setStartedAt(Date.now());
      setNotice('Measurements saved and forwarded to the medical officer.');
      setView('clinical');
      void sync.sync();
    } finally {
      setSaving(false);
    }
  }

  /** Screens 7-9. */
  async function saveClinical() {
    if (!session || !current) return;
    setSaving(true);
    try {
      const clientId = crypto.randomUUID();
      const capture = buildCapture({ username: session.username, deviceId, loginTime: session.loginTime, startedAt });

      const payload = {
        provisionalDiagnosis: clinical.provisionalDiagnosis || undefined,
        labOrder: {
          status: clinical.labStatus,
          samples: clinical.samples,
          labelId: clinical.labelId || undefined,
        },
        prescriptions: clinical.prescriptions.map((line) => ({
          form: line.form,
          drugId: line.drugId,
          drugCode: line.drugCode,
          drugName: line.drugName,
          dosagePattern: line.dosagePattern,
          days: line.days,
          quantity: line.quantity,
        })),
        dressing: { performed: clinical.dressingPerformed, notes: clinical.dressingNotes || undefined },
        referral: {
          required: clinical.referralRequired,
          facilityId: clinical.referralFacilityId,
          ambulanceRequested: clinical.ambulanceRequested,
          reason: clinical.referralReason || undefined,
        },
        advice: clinical.advice || undefined,
        capture: serialiseCapture(capture),
      };

      await enqueue({
        clientId,
        kind: 'CLINICAL',
        walkInClientId: current.clientId,
        walkInId: current.serverId,
        payload: payload as never,
        queuedAt: new Date().toISOString(),
        status: 'PENDING',
        attempts: 0,
      });
      await updateWalkIn(current.clientId, {
        stage: clinical.referralRequired ? 'REFERRED' : 'CLINICAL_DONE',
        clinical: payload as never,
        synced: false,
      });

      await refresh();
      setNotice(
        clinical.referralRequired
          ? 'Referred. Confirm the ambulance with the control room.'
          : 'Consultation complete. Send the patient to the pharmacy counter.',
      );
      setCurrent(null);
      setView('waiting');
      void sync.sync();
    } finally {
      setSaving(false);
    }
  }

  function openWalkIn(walkIn: LocalWalkIn) {
    setCurrent(walkIn);
    setStartedAt(Date.now());
    setNotice(null);
    if (walkIn.stage === 'REGISTERED') {
      setVitals(emptyVitals());
      setView('vitals');
    } else if (walkIn.stage === 'VITALS_DONE') {
      setClinical(emptyClinical());
      setView('clinical');
    } else {
      setView('summary');
    }
  }

  if (status === 'loading') {
    return (
      <div className="shell">
        <div className="empty">Starting…</div>
      </div>
    );
  }
  if (status === 'signed-out') return <LoginScreen />;

  const saveHandler =
    view === 'register' ? undefined : view === 'vitals' ? saveVitals : view === 'clinical' ? saveClinical : undefined;

  return (
    <div className="shell">
      <header className="topbar">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{(bundle?.camp as { name?: string } | undefined)?.name ?? 'Medical camp'}</h1>
          <div className="sub">{session?.fullName}</div>
        </div>
        <span className={`conn ${online ? '' : 'offline'}`}>
          <span aria-hidden>{online ? '●' : '○'}</span>
          {online ? 'Online' : 'Offline'}
          {pendingCount > 0 && ` · ${pendingCount}`}
        </span>
      </header>

      <div className="body">
        {IS_DEMO && (
          <div className="banner warn" style={{ fontSize: 13 }}>
            <strong>Demonstration.</strong> Nothing is saved to a server. Turning your network off is still worth
            trying — the offline queue is the real one.
          </div>
        )}

        {notice && (
          <div className={`banner ${notice.includes('RED') ? 'err' : 'ok'}`} role="status">
            {notice}
          </div>
        )}

        {view === 'home' && (
          <HomeScreen walkIns={walkIns} onNew={startNew} onWaiting={() => setView('waiting')} onOpen={openWalkIn} />
        )}

        {view === 'register' && (
          <RegistrationFlow
            draft={draft}
            onChange={setDraft}
            step={step}
            onStepChange={setStep}
            onComplete={() => void saveRegistration()}
          />
        )}

        {view === 'vitals' && current && (
          <VitalsScreen walkIn={current} draft={vitals} onChange={setVitals} onSave={() => void saveVitals()} saving={saving} />
        )}

        {view === 'clinical' && current && (
          <ClinicalScreen walkIn={current} draft={clinical} onChange={setClinical} onSave={() => void saveClinical()} saving={saving} />
        )}

        {view === 'waiting' && (
          <WaitingListScreen walkIns={walkIns} onOpen={openWalkIn} onNew={startNew} />
        )}

        {view === 'summary' && <SummaryScreen walkIn={current} onBack={() => setView('home')} />}
      </div>

      <BottomBar
        onNew={startNew}
        onSummary={() => setView('summary')}
        onWaiting={() => setView('waiting')}
        onSaveForward={() => {
          if (view === 'register') void saveRegistration();
          else void saveHandler?.();
        }}
        canSave={view === 'register' ? step === 4 : saveHandler !== undefined}
        saving={saving}
        waitingCount={waitingCount}
      />
    </div>
  );
}
