import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { Permission, UserScope } from '@mgms/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { ApiError } from '../errors.js';
import { buildUserScope } from './scope.service.js';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

export interface AuthenticatedUser {
  userId: string;
  username: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  scopeLevel: string;
  departmentId: string | null;
  permissions: Permission[];
  scope: UserScope;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function verifyCredentials(username: string, password: string): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      assignments: true,
    },
  });

  // Always spend the cost of a hash comparison, so a missing username and a
  // wrong password are indistinguishable by response time.
  if (!user) {
    await argon2.hash(password, { type: argon2.argon2id }).catch(() => undefined);
    throw ApiError.unauthorized('Invalid username or password');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw ApiError.forbidden(
      `Account locked after repeated failed sign-ins. Try again after ${user.lockedUntil.toLocaleTimeString()}.`,
    );
  }

  const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
  if (!valid) {
    const failedLogins = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins,
        lockedUntil:
          failedLogins >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    throw ApiError.unauthorized('Invalid username or password');
  }

  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const scope = await buildUserScope(user.role.scopeLevel, user.assignments, user.departmentId);

  return {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    roleCode: user.role.code,
    roleName: user.role.name,
    scopeLevel: user.role.scopeLevel,
    departmentId: user.departmentId,
    permissions: user.role.permissions.map((rp) => rp.permission.code as Permission),
    scope,
  };
}

export async function issueTokens(user: AuthenticatedUser, deviceId?: string): Promise<TokenPair> {
  const accessToken = jwt.sign(
    {
      sub: user.userId,
      username: user.username,
      role: user.roleCode,
      permissions: user.permissions,
      scope: user.scope,
    },
    config.JWT_ACCESS_SECRET,
    // ACCESS_TOKEN_TTL is a duration string such as "30m"; the type is a
    // template literal in @types/jsonwebtoken that config cannot express.
    { expiresIn: config.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'], issuer: 'mgms-api' },
  );

  const refreshToken = randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      userId: user.userId,
      tokenHash: hashToken(refreshToken),
      deviceId,
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    },
  });

  return { accessToken, refreshToken, expiresIn: config.ACCESS_TOKEN_TTL };
}

export async function rotateRefreshToken(refreshToken: string, deviceId?: string): Promise<{ user: AuthenticatedUser; tokens: TokenPair }> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          assignments: true,
        },
      },
    },
  });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token is invalid or has expired');
  }
  if (!stored.user.isActive) throw ApiError.forbidden('This account has been deactivated');

  // Single-use: rotating a token immediately revokes the one presented.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const scope = await buildUserScope(
    stored.user.role.scopeLevel,
    stored.user.assignments,
    stored.user.departmentId,
  );

  const user: AuthenticatedUser = {
    userId: stored.user.id,
    username: stored.user.username,
    fullName: stored.user.fullName,
    roleCode: stored.user.role.code,
    roleName: stored.user.role.name,
    scopeLevel: stored.user.role.scopeLevel,
    departmentId: stored.user.departmentId,
    permissions: stored.user.role.permissions.map((rp) => rp.permission.code as Permission),
    scope,
  };

  return { user, tokens: await issueTokens(user, deviceId) };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}
