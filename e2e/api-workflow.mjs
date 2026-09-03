/**
 * End-to-end check of the clinical workflow against a running API.
 *
 * Exercises the paths that unit tests cannot: a real HTTP surface, real tokens,
 * and the three-part split form passing between three different people.
 *
 *   node e2e/api-workflow.mjs
 *
 * Expects the demonstration seed (npm run db:seed).
 */
import { API, api, capture, createReporter, requireService, signIn } from './lib.mjs';

await requireService(`${API}/health/ready`, 'The API');

const report = createReporter('API — clinical workflow, permissions and sync');
const { check } = report;

// --- The volunteer's leg: screens 1 to 5 ---------------------------------
const volunteer = await signIn('girin1.vol1');
check('a volunteer signs in', !!volunteer.accessToken, volunteer.user.roleName);
check(
  'their scope is limited to one camp',
  volunteer.user.scope.level === 'CAMP' && volunteer.user.scope.campIds.length === 1,
);

const camps = await api('/api/camps?activeOnly=true', { token: volunteer.accessToken });
check('they see only their own camp', camps.data.items.length === 1, `${camps.data.items.length} camp(s)`);
const camp = camps.data.items[0];

const registration = {
  campId: camp.id,
  name: 'Test Pilgrim',
  age: { years: 34, months: 0, days: 0 },
  gender: 'MALE',
  residence: { residenceType: 'HOME_STATE', daysAtResidence: 4000 },
  mobile: '9944332211',
  festivalStay: { years: 0, months: 0, days: 3 },
  symptoms: [
    { symptomCode: 'FEVER', onsetDays: 2, onsetHours: 4 },
    { symptomCode: 'GUM_BLEED', onsetDays: 1, onsetHours: 0 },
  ],
  caseCategories: ['MEDICAL'],
  injuries: [],
  bites: [],
  onsetPlace: 'FESTIVAL_AREA',
  capture: capture('girin1.vol1'),
};

const created = await api('/api/walk-ins', { method: 'POST', token: volunteer.accessToken, body: registration });
check('a walk-in is registered', created.status === 201, created.data.tokenNumber);
check('the syndrome is classified from the symptoms', created.data.primarySyndromeCode === 'AHF', created.data.primarySyndromeCode);
check('a token is allocated for the camp-day', /-\d{8}-\d{4}$/.test(created.data.tokenNumber ?? ''));
const walkInId = created.data.walkInId;

const replay = await api('/api/walk-ins', { method: 'POST', token: volunteer.accessToken, body: registration });
check('replaying the same submission cannot duplicate a patient', replay.data.duplicate === true && replay.data.walkInId === walkInId);

const forbidden = await api(`/api/walk-ins/${walkInId}/vitals`, {
  method: 'POST',
  token: volunteer.accessToken,
  body: { systolic: 120, diastolic: 80, capture: capture('girin1.vol1') },
});
check('a volunteer cannot record vitals', forbidden.status === 403, forbidden.data?.error?.message);

// --- The paramedic's leg: screen 6 ---------------------------------------
const paramedic = await signIn('girin1.para');
const vitals = await api(`/api/walk-ins/${walkInId}/vitals`, {
  method: 'POST',
  token: paramedic.accessToken,
  body: { weightKg: 68, heightCm: 172, systolic: 86, diastolic: 54, pulse: 126, temperatureF: 103.6, capture: capture('girin1.para') },
});
check('a paramedic records measurements', vitals.status === 200);
check('BMI is derived', vitals.data.derived?.bmi === 23, String(vitals.data.derived?.bmi));
check('vitals escalate the triage to red', vitals.data.triage?.level === 'RED', `score ${vitals.data.triage?.score}`);
check('an ambulance is called for', vitals.data.triage?.requiresAmbulance === true);

const detail = await api(`/api/walk-ins/${walkInId}`, { token: paramedic.accessToken });
check(
  'samples are suggested for the classified syndrome',
  detail.data.decisionSupport.suggestedSamples.some((s) => s.sample === 'SERUM'),
);
check('the IDSP reference travels with the record', detail.data.walkIn.syndromes[0].reference.includes('IDSP'));

// --- The medical officer's leg: screens 7 to 9 ---------------------------
const officer = await signIn('girin1.mo');
const inventory = await api(`/api/camps/${camp.id}/inventory`, { token: officer.accessToken });
const drug = inventory.data.items.find((i) => i.drugCode === 'PARACETAMOL' && i.onHand >= 20)
  ?? inventory.data.items.find((i) => i.onHand >= 20);
const stockBefore = drug.onHand;

const clinical = await api(`/api/walk-ins/${walkInId}/clinical`, {
  method: 'POST',
  token: officer.accessToken,
  body: {
    provisionalDiagnosis: 'Acute haemorrhagic fever syndrome — suspect dengue',
    labOrder: { status: 'SAMPLE_COLLECTED', samples: ['SERUM', 'BLOOD_CULTURE'], labelId: 'L900001' },
    prescriptions: [
      { form: 'TABLET', drugId: drug.drugId, drugName: drug.drugName, dosagePattern: 'Q8H', days: 3, quantity: 9 },
    ],
    dressing: { performed: false },
    referral: { required: true, ambulanceRequested: true, speciality: 'GENERAL_MEDICINE', reason: 'Hypotension with bleeding' },
    advice: 'Immediate transfer, no NSAIDs.',
    capture: capture('girin1.mo'),
  },
});
check('the medical officer completes the consultation', clinical.status === 200);

const afterClinical = await api(`/api/walk-ins/${walkInId}`, { token: officer.accessToken });
check('the walk-in is now referred', afterClinical.data.walkIn.stage === 'REFERRED');
check('the referral records the ambulance request', afterClinical.data.walkIn.referral?.ambulanceRequested === true);
check('the laboratory order is stored', afterClinical.data.walkIn.labOrder?.samples.length === 2);

const dispensed = await api(`/api/walk-ins/${walkInId}/dispense`, { method: 'POST', token: officer.accessToken });
check('drugs are issued with no shortage', dispensed.status === 200 && dispensed.data.shortages?.length === 0);
check('a referred patient stays referred after dispensing', dispensed.data.stage === 'REFERRED');

const inventoryAfter = await api(`/api/camps/${camp.id}/inventory`, { token: officer.accessToken });
const drugAfter = inventoryAfter.data.items.find((i) => i.drugId === drug.drugId);
check('camp stock falls by the quantity issued', drugAfter.onHand === stockBefore - 9, `${stockBefore} → ${drugAfter.onHand}`);

// --- Offline sync ---------------------------------------------------------
const registrationClientId = crypto.randomUUID();
const push = await api('/api/sync/push', {
  method: 'POST',
  token: paramedic.accessToken,
  body: {
    deviceId: 'E2E-DEVICE-01',
    appVersion: '1.0.0',
    operations: [
      {
        kind: 'REGISTRATION',
        clientId: registrationClientId,
        queuedAt: new Date().toISOString(),
        payload: { ...registration, name: 'Offline Pilgrim', capture: capture('girin1.para') },
      },
      {
        kind: 'VITALS',
        clientId: crypto.randomUUID(),
        queuedAt: new Date().toISOString(),
        walkInClientId: registrationClientId,
        payload: { pulse: 88, temperatureF: 101.2, capture: capture('girin1.para') },
      },
      {
        kind: 'VITALS',
        clientId: crypto.randomUUID(),
        queuedAt: new Date().toISOString(),
        walkInClientId: crypto.randomUUID(),
        payload: { pulse: 70, capture: capture('girin1.para') },
      },
    ],
  },
});
check('a sync batch reports each operation separately', push.status === 207);
check(
  'a vitals record resolves against a registration in the same batch',
  push.data.applied === 2,
  JSON.stringify(push.data.results?.map((r) => r.status)),
);
check('one bad operation does not fail the batch', push.data.rejected === 1);

const bundle = await api(`/api/sync/pull?campId=${camp.id}`, { token: paramedic.accessToken });
check(
  'the offline bundle carries everything a camp needs',
  bundle.data.symptoms.length > 0 && bundle.data.drugs.length > 0 && bundle.data.referralFacilities.length > 0,
);

// --- Scope isolation ------------------------------------------------------
const admin = await signIn('state.admin');
const allCamps = await api('/api/camps', { token: admin.accessToken });
const foreignCamp = allCamps.data.items.find((c) => c.id !== camp.id);
const crossAccess = await api(`/api/camps/${foreignCamp.id}/inventory`, { token: paramedic.accessToken });
check('a camp device cannot reach another camp', crossAccess.status === 403);

const district = await signIn('district.tvm');
const districtCamps = await api('/api/camps', { token: district.accessToken });
check(
  'a district officer sees their own district',
  districtCamps.data.items.length > 0 && districtCamps.data.items.every((c) => c.district.name === 'Tiruvannamalai'),
  `${districtCamps.data.items.length} camp(s)`,
);

const otherDistrict = await signIn('district.cud');
const otherCamps = await api('/api/camps', { token: otherDistrict.accessToken });
check('a neighbouring district sees none of them', otherCamps.data.items.length === 0);

const supervisor = await signIn('girin1.sup');
check('a supervisor cannot administer roles', (await api('/api/roles', { token: supervisor.accessToken })).status === 403);

// --- The form's own validation rules -------------------------------------
const invalid = await api('/api/walk-ins', {
  method: 'POST',
  token: volunteer.accessToken,
  body: { ...registration, name: 'R@jesh 123', mobile: '12345', capture: capture('girin1.vol1') },
});
check(
  'a bad name and mobile number are rejected with per-field reasons',
  invalid.status === 400,
  JSON.stringify(invalid.data?.error?.details?.issues),
);

// --- Session handling -----------------------------------------------------
const refreshed = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: volunteer.refreshToken } });
check('a refresh token issues a new pair', refreshed.status === 200 && !!refreshed.data.accessToken);
const reused = await api('/api/auth/refresh', { method: 'POST', body: { refreshToken: volunteer.refreshToken } });
check('a spent refresh token is refused', reused.status === 401);

// --- Surveillance ---------------------------------------------------------
const events = await api('/api/events', { token: admin.accessToken });
const eventId = events.data.items[0].id;
const dashboard = await api(`/api/dashboard?eventId=${eventId}`, { token: admin.accessToken });
check('the dashboard returns every panel in one response', dashboard.status === 200 && dashboard.data.timeSeries.length > 0);

const outbreak = dashboard.data.signals.find((s) => s.syndromeCode === 'ADD' && s.scopeType === 'CAMP');
check(
  'the seeded outbreak is detected at the camp that has it',
  outbreak != null && outbreak.verdict.observed > outbreak.verdict.expected * 3,
  outbreak ? `${outbreak.scopeName}: ${outbreak.verdict.observed} vs ${outbreak.verdict.expected} expected, flagged by ${outbreak.verdict.alarmingMethods.join(', ')}` : 'not found',
);

process.exit(report.finish() === 0 ? 0 : 1);
