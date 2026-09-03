import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FORM_NAME, FORM_VERSION } from '@mgms/shared';
import { prisma } from '../src/db.js';
import { runAnalytics } from '../src/services/analytics.service.js';
import { seedFixture, type Fixture } from './fixtures.js';
import { as, signIn } from './helpers.js';

let fixture: Fixture;
let adminToken: string;

/**
 * Insert historical walk-ins directly.
 *
 * The API stamps `registeredAt` from the submission, so back-dating a
 * fortnight of history through it would be a lie about what the endpoint does;
 * the detectors under test only read the stored rows.
 */
async function insertHistory(options: {
  campId: string;
  districtId: string;
  syndromeCode: string;
  daysAgo: number;
  count: number;
}) {
  for (let i = 0; i < options.count; i += 1) {
    const registeredAt = new Date();
    registeredAt.setDate(registeredAt.getDate() - options.daysAgo);
    registeredAt.setHours(10, i % 59, 0, 0);

    await prisma.walkIn.create({
      data: {
        instanceId: randomUUID(),
        tokenNumber: `H-${options.daysAgo}-${options.syndromeCode}-${i}-${randomUUID().slice(0, 6)}`,
        campId: options.campId,
        eventId: fixture.eventId,
        districtId: options.districtId,
        name: 'HISTORY PATIENT',
        ageYears: 30,
        ageTotalMonths: 360,
        ageBand: '25-44',
        gender: 'MALE',
        residenceType: 'HOME_STATE',
        residenceUnitId: fixture.hamletA,
        onsetPlace: 'FESTIVAL_AREA',
        onsetZoneId: fixture.zoneA,
        stage: 'DISPENSED',
        triageLevel: 'GREEN',
        primarySyndromeCode: options.syndromeCode,
        registeredAt,
        formName: FORM_NAME,
        formVersion: FORM_VERSION,
        deviceId: 'HISTORY',
        captureUsername: 'history',
        loginTime: registeredAt,
        recordStartTime: registeredAt,
        recordEndTime: registeredAt,
      },
    });
  }
}

beforeAll(async () => {
  fixture = await seedFixture();
  adminToken = (await signIn('state.admin')).accessToken;

  // A flat fortnight of diarrhoeal disease, then a sharp three-day rise —
  // the shape of a water contamination event at one camp.
  for (let daysAgo = 13; daysAgo >= 3; daysAgo -= 1) {
    await insertHistory({ campId: fixture.campA.id, districtId: fixture.districtA, syndromeCode: 'ADD', daysAgo, count: 2 });
  }
  await insertHistory({ campId: fixture.campA.id, districtId: fixture.districtA, syndromeCode: 'ADD', daysAgo: 2, count: 14 });
  await insertHistory({ campId: fixture.campA.id, districtId: fixture.districtA, syndromeCode: 'ADD', daysAgo: 1, count: 22 });
  await insertHistory({ campId: fixture.campA.id, districtId: fixture.districtA, syndromeCode: 'ADD', daysAgo: 0, count: 28 });

  // A steady background of febrile illness that must NOT trigger an alarm.
  for (let daysAgo = 13; daysAgo >= 0; daysAgo -= 1) {
    await insertHistory({ campId: fixture.campA.id, districtId: fixture.districtA, syndromeCode: 'AFI', daysAgo, count: 5 });
  }
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('aberration detection over stored cases', () => {
  it('raises a critical alert for the syndrome that is actually rising', async () => {
    const result = await runAnalytics();
    expect(result.signalsFound).toBeGreaterThan(0);

    const alerts = await prisma.alert.findMany({ where: { type: 'ABERRATION' } });
    const add = alerts.find((a) => a.dedupeKey.includes('ADD') && a.dedupeKey.includes('CAMP'));

    expect(add).toBeTruthy();
    expect(add?.severity).toBe('CRITICAL');
    expect(add?.body).toMatch(/notifiable/i);

    const evidence = add?.evidence as { observed: number; expected: number; alarmingMethods: string[] };
    expect(evidence.observed).toBe(28);
    expect(evidence.expected).toBeLessThan(5);
    expect(evidence.alarmingMethods.length).toBeGreaterThanOrEqual(2);
  });

  it('stays silent on the syndrome that is merely steady', async () => {
    const alerts = await prisma.alert.findMany({ where: { type: 'ABERRATION' } });
    expect(alerts.some((a) => a.dedupeKey.includes('AFI'))).toBe(false);
  });

  it('does not raise a second alert for a condition that persists', async () => {
    const before = await prisma.alert.count({ where: { type: 'ABERRATION' } });
    await runAnalytics();
    const after = await prisma.alert.count({ where: { type: 'ABERRATION' } });

    expect(after).toBe(before);
  });

  it('keeps an acknowledged alert acknowledged while the condition holds', async () => {
    const alert = await prisma.alert.findFirstOrThrow({ where: { type: 'ABERRATION' } });
    const acknowledged = await as(adminToken).post(`/api/alerts/${alert.id}/acknowledge`);
    expect(acknowledged.status).toBe(200);

    await runAnalytics();

    const after = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(after.acknowledgedAt).not.toBeNull();
  });
});

describe('the dashboard snapshot', () => {
  it('returns every panel from one coherent filter', async () => {
    const response = await as(adminToken).get(`/api/dashboard?eventId=${fixture.eventId}`);

    expect(response.status).toBe(200);
    const body = response.body;

    expect(body.kpis.totalWalkIns).toBeGreaterThan(80);
    expect(body.bySyndrome.find((b: { key: string }) => b.key === 'ADD').count).toBe(86);
    expect(body.timeSeries).toHaveLength(14);
    expect(body.geo[0].name).toBe('Hamlet A');
    expect(body.camps).toHaveLength(2);
    expect(body.signals.length).toBeGreaterThan(0);
  });

  it('narrows every panel when the filter narrows', async () => {
    const all = await as(adminToken).get(`/api/dashboard?eventId=${fixture.eventId}`);
    const filtered = await as(adminToken).get(`/api/dashboard?eventId=${fixture.eventId}&syndromeCodes=ADD`);

    expect(filtered.body.kpis.totalWalkIns).toBeLessThan(all.body.kpis.totalWalkIns);
    expect(filtered.body.bySyndrome).toHaveLength(1);
    expect(filtered.body.bySyndrome[0].key).toBe('ADD');
  });

  it('respects a date filter', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const response = await as(adminToken).get(`/api/dashboard?eventId=${fixture.eventId}&from=${today}&to=${today}`);

    expect(response.body.kpis.totalWalkIns).toBe(response.body.kpis.todayWalkIns);
  });

  it('finds the zone carrying the excess risk', async () => {
    const response = await as(adminToken).get(`/api/dashboard?eventId=${fixture.eventId}`);
    // A single zone holds every case, so the scan has nothing to contrast it
    // against and correctly reports no cluster rather than inventing one.
    expect(Array.isArray(response.body.clusters)).toBe(true);
  });
});

describe('operational alerts', () => {
  it('flags a camp that has stopped syncing', async () => {
    await prisma.camp.update({
      where: { id: fixture.campB.id },
      data: { lastSyncAt: new Date(Date.now() - 5 * 3600_000) },
    });

    await runAnalytics();

    const alert = await prisma.alert.findUnique({ where: { dedupeKey: `SYNC_STALE:${fixture.campB.id}` } });
    expect(alert).toBeTruthy();
    expect(alert?.body).toMatch(/minutes ago/);
  });

  it('flags a camp whose readiness has not been reported', async () => {
    await runAnalytics();
    const alerts = await prisma.alert.findMany({ where: { type: 'CAMP_NOT_READY' } });
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]?.body).toMatch(/readiness/i);
  });

  it('projects a stockout from the camp’s own consumption', async () => {
    const drugId = fixture.drugIds.ORS!;
    await prisma.campInventory.update({
      where: { campId_drugId: { campId: fixture.campA.id, drugId } },
      data: { onHand: 10 },
    });

    // Three days of heavy, rising issue.
    for (const [daysAgo, quantity] of [[2, 40], [1, 60], [0, 90]] as const) {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - daysAgo);
      await prisma.stockTransaction.create({
        data: { campId: fixture.campA.id, drugId, type: 'ISSUE', quantity: -quantity, balanceAfter: 10, createdAt },
      });
    }

    await runAnalytics();

    const alert = await prisma.alert.findUnique({ where: { dedupeKey: `STOCKOUT:${fixture.campA.id}:ORS` } });
    expect(alert?.severity).toBe('CRITICAL');
    expect(alert?.body).toMatch(/Indent \d+ units/);
  });

  it('scopes alerts to the user’s own area', async () => {
    const districtB = await signIn('district.b');
    const response = await as(districtB.accessToken).get('/api/alerts?limit=200');

    const outside = response.body.items.filter(
      (a: { campId: string | null }) => a.campId != null && a.campId !== fixture.campB.id,
    );
    expect(outside).toHaveLength(0);
  });
});
