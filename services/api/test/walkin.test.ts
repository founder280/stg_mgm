import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { capture, registrationPayload, seedFixture, type Fixture } from './fixtures.js';
import { as, signIn } from './helpers.js';

let fixture: Fixture;
let volunteerToken: string;
let staffToken: string;

beforeAll(async () => {
  fixture = await seedFixture();
  volunteerToken = (await signIn('camp.volunteer')).accessToken;
  staffToken = (await signIn('camp.staff')).accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('registration — the form rules', () => {
  it('normalises the name to upper case and allocates a token', async () => {
    const response = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { name: '  ravi   kumar ', capture: capture() }));

    expect(response.status).toBe(201);
    expect(response.body.tokenNumber).toMatch(/^CAMP-A-\d{8}-\d{4}$/);

    const stored = await prisma.walkIn.findUniqueOrThrow({ where: { id: response.body.walkInId } });
    expect(stored.name).toBe('RAVI KUMAR');
  });

  it('rejects a name with digits or punctuation, and one over fifty characters', async () => {
    const punctuation = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { name: 'R@vi 99', capture: capture() }));
    expect(punctuation.status).toBe(400);
    expect(JSON.stringify(punctuation.body.error.details)).toMatch(/letters and spaces/i);

    const tooLong = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { name: 'A'.repeat(51), capture: capture() }));
    expect(tooLong.status).toBe(400);
  });

  it('requires a non-zero age and rejects one beyond 150 years', async () => {
    const zero = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { age: { years: 0, months: 0, days: 0 }, capture: capture() }));
    expect(zero.status).toBe(400);

    const impossible = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { age: { years: 151, months: 0, days: 0 }, capture: capture() }));
    expect(impossible.status).toBe(400);
  });

  it('accepts an age given only in days, for a newborn', async () => {
    const response = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { age: { years: 0, months: 0, days: 6 }, capture: capture() }));

    expect(response.status).toBe(201);
    const stored = await prisma.walkIn.findUniqueOrThrow({ where: { id: response.body.walkInId } });
    expect(stored.ageBand).toBe('0-4');
  });

  it('normalises a mobile number to the +91 form and rejects a malformed one', async () => {
    const good = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { mobile: '9876543210', capture: capture() }));
    const stored = await prisma.walkIn.findUniqueOrThrow({ where: { id: good.body.walkInId } });
    expect(stored.mobile).toBe('+919876543210');

    const bad = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { mobile: '12345', capture: capture() }));
    expect(bad.status).toBe(400);
  });

  it('rejects an unknown symptom code rather than silently dropping it', async () => {
    const response = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(
        registrationPayload(fixture.campA.id, {
          symptoms: [{ symptomCode: 'NOT_A_SYMPTOM', onsetDays: 1, onsetHours: 0 }],
          capture: capture(),
        }),
      );
    expect(response.status).toBe(400);
  });

  it('stores the capture metadata and stamps the server-side fields itself', async () => {
    const instanceId = randomUUID();
    const response = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { capture: capture('camp.volunteer', instanceId) }));

    const stored = await prisma.walkIn.findUniqueOrThrow({ where: { id: response.body.walkInId } });
    expect(stored.instanceId).toBe(instanceId);
    expect(stored.deviceId).toBe('TEST-DEVICE-01');
    expect(stored.formVersion).toBe('2.0');
    expect(stored.receivedTime).toBeInstanceOf(Date);
    expect(stored.submittedIp).toBeTruthy();
  });

  it('is idempotent on the device instance id', async () => {
    const payload = registrationPayload(fixture.campA.id, { capture: capture() });

    const first = await as(volunteerToken).post('/api/walk-ins').send(payload);
    const replay = await as(volunteerToken).post('/api/walk-ins').send(payload);

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    expect(replay.body.walkInId).toBe(first.body.walkInId);

    const count = await prisma.walkIn.count({ where: { instanceId: payload.capture.instanceId } });
    expect(count).toBe(1);
  });

  it('classifies the syndrome and records the reference with the case', async () => {
    const response = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(
        registrationPayload(fixture.campA.id, {
          symptoms: [
            { symptomCode: 'FEVER', onsetDays: 3, onsetHours: 0 },
            { symptomCode: 'GUM_BLEED', onsetDays: 1, onsetHours: 0 },
          ],
          capture: capture(),
        }),
      );

    expect(response.body.primarySyndromeCode).toBe('AHF');

    const syndromes = await prisma.walkInSyndrome.findMany({ where: { walkInId: response.body.walkInId } });
    const primary = syndromes.find((s) => s.isPrimary);
    expect(primary?.syndromeCode).toBe('AHF');
    expect(primary?.reference).toContain('IDSP');
  });

  it('raises a critical alert the moment a walk-in triages red', async () => {
    const response = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(
        registrationPayload(fixture.campA.id, {
          symptoms: [{ symptomCode: 'SOB', onsetDays: 1, onsetHours: 0 }],
          caseCategories: ['CRITICALLY_ILL'],
          capture: capture(),
        }),
      );

    expect(response.body.triageLevel).toBe('RED');
    const alert = await prisma.alert.findUnique({ where: { dedupeKey: `CRITICAL_CASE:${response.body.walkInId}` } });
    expect(alert?.severity).toBe('CRITICAL');
  });
});

describe('the three-part split workflow', () => {
  it('moves a walk-in through registration, vitals and the clinical leg', async () => {
    const registration = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { capture: capture() }));
    const walkInId = registration.body.walkInId;

    let stored = await prisma.walkIn.findUniqueOrThrow({ where: { id: walkInId } });
    expect(stored.stage).toBe('REGISTERED');

    await as(staffToken)
      .post(`/api/walk-ins/${walkInId}/vitals`)
      .send({ weightKg: 70, heightCm: 170, systolic: 150, diastolic: 95, pulse: 88, temperatureF: 101.2, capture: capture('camp.staff') });

    stored = await prisma.walkIn.findUniqueOrThrow({ where: { id: walkInId } });
    expect(stored.stage).toBe('VITALS_DONE');

    const vitals = await prisma.vitals.findUniqueOrThrow({ where: { walkInId } });
    expect(vitals.bmi).toBe(24.2);
    expect(vitals.newlyDetectedHypertension).toBe(true);

    await as(staffToken)
      .post(`/api/walk-ins/${walkInId}/clinical`)
      .send({
        provisionalDiagnosis: 'Acute febrile illness',
        labOrder: { status: 'SAMPLE_COLLECTED', samples: ['SERUM'], labelId: 'L1234' },
        prescriptions: [
          {
            form: 'TABLET',
            drugId: fixture.drugIds.PARACETAMOL,
            drugName: 'Paracetamol 500 mg',
            dosagePattern: 'Q8H',
            days: 3,
            quantity: 9,
          },
        ],
        dressing: { performed: false },
        capture: capture('camp.staff'),
      });

    stored = await prisma.walkIn.findUniqueOrThrow({ where: { id: walkInId } });
    expect(stored.stage).toBe('CLINICAL_DONE');
  });

  it('deducts camp stock only when the prescription is dispensed', async () => {
    const registration = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { capture: capture() }));
    const walkInId = registration.body.walkInId;

    const before = await prisma.campInventory.findUniqueOrThrow({
      where: { campId_drugId: { campId: fixture.campA.id, drugId: fixture.drugIds.ORS! } },
    });

    await as(staffToken)
      .post(`/api/walk-ins/${walkInId}/clinical`)
      .send({
        prescriptions: [
          { form: 'SACHET', drugId: fixture.drugIds.ORS, drugName: 'ORS sachet', dosagePattern: 'SOS', days: 3, quantity: 6 },
        ],
        capture: capture('camp.staff'),
      });

    const afterClinical = await prisma.campInventory.findUniqueOrThrow({
      where: { campId_drugId: { campId: fixture.campA.id, drugId: fixture.drugIds.ORS! } },
    });
    expect(afterClinical.onHand).toBe(before.onHand);

    const dispensed = await as(staffToken).post(`/api/walk-ins/${walkInId}/dispense`);
    expect(dispensed.status).toBe(200);
    expect(dispensed.body.shortages).toEqual([]);

    const afterDispense = await prisma.campInventory.findUniqueOrThrow({
      where: { campId_drugId: { campId: fixture.campA.id, drugId: fixture.drugIds.ORS! } },
    });
    expect(afterDispense.onHand).toBe(before.onHand - 6);

    const ledger = await prisma.stockTransaction.findFirst({
      where: { campId: fixture.campA.id, drugId: fixture.drugIds.ORS, type: 'ISSUE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(ledger?.quantity).toBe(-6);
    expect(ledger?.balanceAfter).toBe(afterDispense.onHand);
  });

  it('refuses to issue more stock than the camp holds and reports the shortage', async () => {
    const drugId = fixture.drugIds.AZITHROMYCIN!;
    await prisma.campInventory.update({
      where: { campId_drugId: { campId: fixture.campA.id, drugId } },
      data: { onHand: 2 },
    });

    const registration = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { capture: capture() }));

    await as(staffToken)
      .post(`/api/walk-ins/${registration.body.walkInId}/clinical`)
      .send({
        prescriptions: [
          { form: 'TABLET', drugId, drugName: 'Azithromycin 500 mg', dosagePattern: '1-0-0', days: 5, quantity: 5 },
        ],
        capture: capture('camp.staff'),
      });

    const dispensed = await as(staffToken).post(`/api/walk-ins/${registration.body.walkInId}/dispense`);
    expect(dispensed.body.shortages[0]).toMatch(/Azithromycin/);

    const inventory = await prisma.campInventory.findUniqueOrThrow({
      where: { campId_drugId: { campId: fixture.campA.id, drugId } },
    });
    // The shelf and the ledger must not disagree: nothing was taken.
    expect(inventory.onHand).toBe(2);
  });

  it('keeps a referred patient referred even after their drugs are handed over', async () => {
    const registration = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(registrationPayload(fixture.campA.id, { capture: capture() }));
    const walkInId = registration.body.walkInId;

    await as(staffToken)
      .post(`/api/walk-ins/${walkInId}/clinical`)
      .send({
        prescriptions: [
          { form: 'IVF', drugId: fixture.drugIds.NS_IVF, drugName: 'Normal saline', dosagePattern: 'STAT', days: 1, quantity: 1 },
        ],
        referral: { required: true, ambulanceRequested: true, reason: 'Hypotension' },
        capture: capture('camp.staff'),
      });

    expect((await prisma.walkIn.findUniqueOrThrow({ where: { id: walkInId } })).stage).toBe('REFERRED');

    const dispensed = await as(staffToken).post(`/api/walk-ins/${walkInId}/dispense`);
    expect(dispensed.body.stage).toBe('REFERRED');
    expect((await prisma.walkIn.findUniqueOrThrow({ where: { id: walkInId } })).stage).toBe('REFERRED');

    const referral = await prisma.referral.findUniqueOrThrow({ where: { walkInId } });
    expect(referral.ambulanceRequested).toBe(true);
  });

  it('offers decision support drawn from the camp’s own stock', async () => {
    const registration = await as(volunteerToken)
      .post('/api/walk-ins')
      .send(
        registrationPayload(fixture.campA.id, {
          symptoms: [{ symptomCode: 'DIARRHOEA', onsetDays: 1, onsetHours: 0 }],
          capture: capture(),
        }),
      );

    const detail = await as(staffToken).get(`/api/walk-ins/${registration.body.walkInId}`);
    expect(detail.body.decisionSupport.suggestedSamples.map((s: { sample: string }) => s.sample)).toContain('STOOL');
    expect(detail.body.decisionSupport.suggestedTreatment.syndromeCode).toBe('ADD');
    expect(detail.body.decisionSupport.suggestedTreatment.lines[0].drugCode).toBe('ORS');
  });

  it('exports a line listing as CSV', async () => {
    const officer = await signIn('district.a');
    const response = await as(officer.accessToken).get('/api/walk-ins/export/csv');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    const [header, ...rows] = response.text.split('\n');
    expect(header).toContain('token,registered_at,camp');
    expect(rows.length).toBeGreaterThan(0);
  });
});
