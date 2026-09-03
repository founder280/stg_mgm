import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { registrationPayload, seedFixture, capture, type Fixture } from './fixtures.js';
import { as, signIn } from './helpers.js';

let fixture: Fixture;

beforeAll(async () => {
  fixture = await seedFixture();

  // One walk-in in each district, so scope filtering has something to hide.
  const volunteer = await signIn('camp.volunteer');
  await as(volunteer.accessToken).post('/api/walk-ins').send(registrationPayload(fixture.campA.id));

  const admin = await signIn('state.admin');
  await as(admin.accessToken)
    .post('/api/walk-ins')
    .send({ ...registrationPayload(fixture.campB.id), capture: capture('state.admin') });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('permission enforcement', () => {
  it('lets a volunteer register but not record vitals or see the roles console', async () => {
    const volunteer = await signIn('camp.volunteer');
    const client = as(volunteer.accessToken);

    const walkIns = await client.get('/api/walk-ins');
    expect(walkIns.status).toBe(200);

    const roles = await client.get('/api/roles');
    expect(roles.status).toBe(403);
    expect(roles.body.error.message).toContain('VOLUNTEER');

    const vitals = await client
      .post(`/api/walk-ins/${walkIns.body.items[0].id}/vitals`)
      .send({ pulse: 80, capture: capture('camp.volunteer') });
    expect(vitals.status).toBe(403);
    expect(vitals.body.error.message).toContain('walkin.vitals');
  });

  it('lets field staff record vitals and the clinical leg', async () => {
    const staff = await signIn('camp.staff');
    const list = await as(staff.accessToken).get('/api/walk-ins');
    const walkInId = list.body.items[0].id;

    const vitals = await as(staff.accessToken)
      .post(`/api/walk-ins/${walkInId}/vitals`)
      .send({ pulse: 78, systolic: 118, diastolic: 76, capture: capture('camp.staff') });
    expect(vitals.status).toBe(200);
  });

  it('blocks a supervisor from administering roles but allows the dashboard', async () => {
    const supervisor = await signIn('camp.supervisor');
    expect((await as(supervisor.accessToken).get('/api/roles')).status).toBe(403);
    expect((await as(supervisor.accessToken).get('/api/dashboard')).status).toBe(200);
  });
});

describe('data scope', () => {
  it('shows a state user every camp', async () => {
    const admin = await signIn('state.admin');
    const camps = await as(admin.accessToken).get('/api/camps');
    expect(camps.body.items).toHaveLength(2);
  });

  it('limits a district user to their own district', async () => {
    const districtA = await signIn('district.a');
    const camps = await as(districtA.accessToken).get('/api/camps');

    expect(camps.body.items).toHaveLength(1);
    expect(camps.body.items[0].code).toBe('CAMP-A');

    const walkIns = await as(districtA.accessToken).get('/api/walk-ins');
    expect(walkIns.body.items.every((w: { camp: { name: string } }) => w.camp.name === 'Camp A')).toBe(true);
  });

  it('shows a user in the other district a disjoint set', async () => {
    const districtB = await signIn('district.b');
    const camps = await as(districtB.accessToken).get('/api/camps');
    expect(camps.body.items).toHaveLength(1);
    expect(camps.body.items[0].code).toBe('CAMP-B');
  });

  it('shows an unassigned user nothing rather than everything', async () => {
    const unassigned = await signIn('unassigned');
    const camps = await as(unassigned.accessToken).get('/api/camps');
    const walkIns = await as(unassigned.accessToken).get('/api/walk-ins');

    expect(camps.body.items).toHaveLength(0);
    expect(walkIns.body.items).toHaveLength(0);
  });

  it('refuses an action against a camp outside the user scope', async () => {
    const volunteer = await signIn('camp.volunteer');
    const foreign = await as(volunteer.accessToken)
      .post('/api/walk-ins')
      .send({ ...registrationPayload(fixture.campB.id), capture: capture('camp.volunteer') });

    expect(foreign.status).toBe(403);
    expect(foreign.body.error.message).toMatch(/outside your assigned area/i);
  });

  it('does not let a filter widen a user past their own scope', async () => {
    const districtA = await signIn('district.a');
    // Asking explicitly for the other district's camp must still return nothing.
    const response = await as(districtA.accessToken).get(`/api/walk-ins?campId=${fixture.campB.id}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(0);
  });

  it('scopes the dashboard the same way it scopes the list', async () => {
    const admin = await signIn('state.admin');
    const districtA = await signIn('district.a');

    const all = await as(admin.accessToken).get(`/api/dashboard?eventId=${fixture.eventId}`);
    const scoped = await as(districtA.accessToken).get(`/api/dashboard?eventId=${fixture.eventId}`);

    expect(all.body.kpis.totalWalkIns).toBeGreaterThan(scoped.body.kpis.totalWalkIns);
    expect(scoped.body.camps).toHaveLength(1);
  });
});

describe('user administration', () => {
  it('stops a district user from minting a state administrator', async () => {
    const districtA = await signIn('district.a');
    const attempt = await as(districtA.accessToken).post('/api/users').send({
      username: 'sneaky.admin',
      fullName: 'Sneaky Admin',
      password: 'Passw0rd!2026',
      roleCode: 'STATE_SUPER_ADMIN',
      assignments: [],
    });

    expect(attempt.status).toBe(403);
    expect(attempt.body.error.message).toMatch(/cannot create users with the role/i);
  });

  it('stops a district user from assigning staff outside their district', async () => {
    const districtA = await signIn('district.a');
    const attempt = await as(districtA.accessToken).post('/api/users').send({
      username: 'wrong.area',
      fullName: 'Wrong Area',
      password: 'Passw0rd!2026',
      roleCode: 'VOLUNTEER',
      assignments: [{ scopeType: 'CAMP', scopeId: fixture.campB.id }],
    });

    expect(attempt.status).toBe(403);
    expect(attempt.body.error.message).toMatch(/outside your own area/i);
  });

  it('allows a district user to create a volunteer inside their own camp', async () => {
    const districtA = await signIn('district.a');
    const created = await as(districtA.accessToken).post('/api/users').send({
      username: 'new.volunteer',
      fullName: 'New Volunteer',
      password: 'Passw0rd!2026',
      roleCode: 'VOLUNTEER',
      assignments: [{ scopeType: 'CAMP', scopeId: fixture.campA.id }],
    });

    expect(created.status).toBe(201);
    expect(created.body.roleCode).toBe('VOLUNTEER');
  });

  it('refuses to change the permissions of a built-in role', async () => {
    const admin = await signIn('state.admin');
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'VOLUNTEER' } });

    const attempt = await as(admin.accessToken)
      .patch(`/api/roles/${role.id}`)
      .send({ permissions: ['role.write'] });

    expect(attempt.status).toBe(403);
    expect(attempt.body.error.message).toMatch(/built-in role/i);
  });
});
