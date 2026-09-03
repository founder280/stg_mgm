import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { capture, registrationPayload, seedFixture, type Fixture } from './fixtures.js';
import { as, signIn } from './helpers.js';

let fixture: Fixture;
let token: string;

beforeAll(async () => {
  fixture = await seedFixture();
  token = (await signIn('camp.staff')).accessToken;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const operation = (kind: 'REGISTRATION' | 'VITALS' | 'CLINICAL', extra: Record<string, unknown> = {}) => ({
  kind,
  clientId: randomUUID(),
  queuedAt: new Date().toISOString(),
  ...extra,
});

describe('offline sync', () => {
  it('applies a batch and reports the outcome of every operation', async () => {
    const response = await as(token)
      .post('/api/sync/push')
      .send({
        deviceId: 'TEST-DEVICE-01',
        appVersion: '1.0.0',
        operations: [
          operation('REGISTRATION', { payload: registrationPayload(fixture.campA.id, { capture: capture('camp.staff') }) }),
          operation('REGISTRATION', { payload: registrationPayload(fixture.campA.id, { name: 'Second Patient', capture: capture('camp.staff') }) }),
        ],
      });

    expect(response.status).toBe(207);
    expect(response.body.applied).toBe(2);
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results.every((r: { status: string }) => r.status === 'APPLIED')).toBe(true);
    expect(response.body.results[0].tokenNumber).toMatch(/^CAMP-A-/);
  });

  it('resolves a vitals record against a registration in the same batch', async () => {
    const registrationClientId = randomUUID();

    const response = await as(token)
      .post('/api/sync/push')
      .send({
        deviceId: 'TEST-DEVICE-01',
        operations: [
          {
            kind: 'REGISTRATION',
            clientId: registrationClientId,
            queuedAt: new Date().toISOString(),
            payload: registrationPayload(fixture.campA.id, { capture: capture('camp.staff') }),
          },
          operation('VITALS', {
            walkInClientId: registrationClientId,
            payload: { pulse: 92, temperatureF: 101.4, capture: capture('camp.staff') },
          }),
        ],
      });

    expect(response.body.applied).toBe(2);
    const walkInId = response.body.results[0].walkInId;
    const vitals = await prisma.vitals.findUnique({ where: { walkInId } });
    expect(vitals?.pulse).toBe(92);
    expect((await prisma.walkIn.findUniqueOrThrow({ where: { id: walkInId } })).stage).toBe('VITALS_DONE');
  });

  it('rejects one bad operation without losing the rest of the batch', async () => {
    const response = await as(token)
      .post('/api/sync/push')
      .send({
        deviceId: 'TEST-DEVICE-01',
        operations: [
          operation('REGISTRATION', { payload: registrationPayload(fixture.campA.id, { capture: capture('camp.staff') }) }),
          // References a walk-in the server has never seen.
          operation('VITALS', { walkInClientId: randomUUID(), payload: { pulse: 70, capture: capture('camp.staff') } }),
          operation('REGISTRATION', { payload: registrationPayload(fixture.campA.id, { name: 'Third Patient', capture: capture('camp.staff') }) }),
        ],
      });

    expect(response.body.applied).toBe(2);
    expect(response.body.rejected).toBe(1);
    expect(response.body.results[1].status).toBe('REJECTED');
    expect(response.body.results[1].message).toMatch(/has not reached the server/i);
  });

  it('is idempotent, so replaying a batch cannot duplicate a patient', async () => {
    const batch = {
      deviceId: 'TEST-DEVICE-01',
      operations: [
        operation('REGISTRATION', { payload: registrationPayload(fixture.campA.id, { name: 'Replay Patient', capture: capture('camp.staff') }) }),
      ],
    };

    const first = await as(token).post('/api/sync/push').send(batch);
    const replay = await as(token).post('/api/sync/push').send(batch);

    expect(first.body.applied).toBe(1);
    expect(replay.body.duplicates).toBe(1);
    expect(replay.body.results[0].walkInId).toBe(first.body.results[0].walkInId);

    const count = await prisma.walkIn.count({ where: { name: 'REPLAY PATIENT' } });
    expect(count).toBe(1);
  });

  it('records the batch and refreshes the camp’s last-sync time', async () => {
    await prisma.camp.update({ where: { id: fixture.campA.id }, data: { lastSyncAt: new Date('2020-01-01') } });

    await as(token)
      .post('/api/sync/push')
      .send({
        deviceId: 'TEST-DEVICE-02',
        operations: [operation('REGISTRATION', { payload: registrationPayload(fixture.campA.id, { capture: capture('camp.staff') }) })],
      });

    const batch = await prisma.syncBatch.findFirst({ where: { deviceId: 'TEST-DEVICE-02' } });
    expect(batch?.applied).toBe(1);

    const camp = await prisma.camp.findUniqueOrThrow({ where: { id: fixture.campA.id } });
    expect(camp.lastSyncAt!.getTime()).toBeGreaterThan(new Date('2020-01-02').getTime());
  });

  it('refuses a batch aimed at a camp outside the device’s scope', async () => {
    const response = await as(token)
      .post('/api/sync/push')
      .send({
        deviceId: 'TEST-DEVICE-01',
        operations: [operation('REGISTRATION', { payload: registrationPayload(fixture.campB.id, { capture: capture('camp.staff') }) })],
      });

    expect(response.status).toBe(403);
  });

  it('serves an offline bundle with everything a camp needs to work unconnected', async () => {
    const response = await as(token).get(`/api/sync/pull?campId=${fixture.campA.id}`);

    expect(response.status).toBe(200);
    expect(response.body.symptoms.length).toBeGreaterThan(0);
    expect(response.body.syndromes.length).toBeGreaterThan(0);
    expect(response.body.drugs.length).toBeGreaterThan(0);
    expect(response.body.inventory.length).toBeGreaterThan(0);
    expect(response.body.referralFacilities.length).toBeGreaterThan(0);
    expect(Array.isArray(response.body.waitingList)).toBe(true);

    // The bundle carries the camp's own district subtree, so the address
    // picker works with no connection.
    const codes = response.body.addressUnits.map((u: { code: string }) => u.code);
    expect(codes).toContain('H-A');
    expect(codes).not.toContain('D-B');
  });

  it('refuses to pull a bundle for a camp outside the device’s scope', async () => {
    const response = await as(token).get(`/api/sync/pull?campId=${fixture.campB.id}`);
    expect(response.status).toBe(403);
  });
});
