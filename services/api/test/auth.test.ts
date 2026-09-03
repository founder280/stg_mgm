import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { TEST_PASSWORD, seedFixture, type Fixture } from './fixtures.js';
import { as, request, signIn } from './helpers.js';

let fixture: Fixture;

beforeAll(async () => {
  fixture = await seedFixture();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('authentication', () => {
  it('signs a user in and returns their permissions and scope', async () => {
    const session = await signIn('camp.volunteer');
    expect(session.user.roleCode).toBe('VOLUNTEER');
    expect(session.user.permissions).toContain('walkin.register');
    expect(session.user.permissions).not.toContain('walkin.vitals');
    expect(session.user.scope.campIds).toEqual([fixture.campA.id]);
  });

  it('rejects a wrong password without revealing whether the user exists', async () => {
    const wrongPassword = await request().post('/api/auth/login').send({ username: 'state.admin', password: 'WrongPassw0rd!' });
    const noSuchUser = await request().post('/api/auth/login').send({ username: 'nobody.here', password: 'WrongPassw0rd!' });

    expect(wrongPassword.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(noSuchUser.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('locks an account after repeated failures and keeps it locked for the right password', async () => {
    await prisma.user.create({
      data: {
        username: 'lockme',
        fullName: 'Lock Me',
        passwordHash: (await prisma.user.findUniqueOrThrow({ where: { username: 'state.admin' } })).passwordHash,
        roleId: (await prisma.role.findUniqueOrThrow({ where: { code: 'VOLUNTEER' } })).id,
      },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request().post('/api/auth/login').send({ username: 'lockme', password: 'Nope12345!' });
    }

    const locked = await request().post('/api/auth/login').send({ username: 'lockme', password: TEST_PASSWORD });
    expect(locked.status).toBe(403);
    expect(locked.body.error.message).toMatch(/locked/i);
  });

  it('rotates the refresh token and refuses to reuse the old one', async () => {
    const session = await signIn('state.admin');

    const first = await request().post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(session.refreshToken);

    const replay = await request().post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(replay.status).toBe(401);
  });

  it('refuses a request with no token, and one with a forged token', async () => {
    expect((await request().get('/api/camps')).status).toBe(401);
    expect((await as('not.a.real.token').get('/api/camps')).status).toBe(401);
  });

  it('reports the signed-in user with their resolved assignments', async () => {
    const session = await signIn('district.a');
    const me = await as(session.accessToken).get('/api/auth/me');

    expect(me.status).toBe(200);
    expect(me.body.roleCode).toBe('DISTRICT_USER');
    expect(me.body.assignments).toEqual([
      expect.objectContaining({ type: 'DISTRICT', name: 'District A' }),
    ]);
  });

  it('revokes every session when the password changes', async () => {
    const session = await signIn('state.officer');

    const changed = await as(session.accessToken)
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'BrandNewPassw0rd!' });
    expect(changed.status).toBe(204);

    const oldRefresh = await request().post('/api/auth/refresh').send({ refreshToken: session.refreshToken });
    expect(oldRefresh.status).toBe(401);

    const withNew = await request().post('/api/auth/login').send({ username: 'state.officer', password: 'BrandNewPassw0rd!' });
    expect(withNew.status).toBe(200);
  });
});
