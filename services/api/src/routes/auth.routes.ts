import { Router } from 'express';
import { z } from 'zod';
import { loginSchema } from '@mgms/shared';
import { asyncHandler } from '../middleware/error-handler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { issueTokens, revokeRefreshToken, rotateRefreshToken, verifyCredentials } from '../services/auth.service.js';
import { recordAudit } from '../services/audit.service.js';
import { prisma } from '../db.js';
import { ApiError } from '../errors.js';

export const authRouter: Router = Router();

authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { username, password, deviceId } = req.body as z.infer<typeof loginSchema>;
    const user = await verifyCredentials(username, password);
    const tokens = await issueTokens(user, deviceId);

    await recordAudit({
      userId: user.userId,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.userId,
      summary: `${user.username} signed in`,
      req,
    });

    res.json({
      ...tokens,
      user: {
        id: user.userId,
        username: user.username,
        fullName: user.fullName,
        roleCode: user.roleCode,
        roleName: user.roleName,
        scopeLevel: user.scopeLevel,
        permissions: user.permissions,
        scope: user.scope,
      },
    });
  }),
);

authRouter.post(
  '/refresh',
  validate(z.object({ refreshToken: z.string().min(10), deviceId: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const { refreshToken, deviceId } = req.body as { refreshToken: string; deviceId?: string };
    const { user, tokens } = await rotateRefreshToken(refreshToken, deviceId);
    res.json({
      ...tokens,
      user: {
        id: user.userId,
        username: user.username,
        fullName: user.fullName,
        roleCode: user.roleCode,
        roleName: user.roleName,
        scopeLevel: user.scopeLevel,
        permissions: user.permissions,
        scope: user.scope,
      },
    });
  }),
);

authRouter.post(
  '/logout',
  validate(z.object({ refreshToken: z.string().min(10) })),
  asyncHandler(async (req, res) => {
    await revokeRefreshToken((req.body as { refreshToken: string }).refreshToken);
    res.status(204).send();
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const principal = req.principal!;
    const user = await prisma.user.findUnique({
      where: { id: principal.userId },
      include: {
        role: true,
        department: true,
        assignments: true,
      },
    });
    if (!user) throw ApiError.notFound('User not found');

    // Resolve assignment names so the client can show "Mulugu district".
    const addressIds = user.assignments.filter((a) => a.scopeType !== 'CAMP').map((a) => a.scopeId);
    const campIds = user.assignments.filter((a) => a.scopeType === 'CAMP').map((a) => a.scopeId);
    const [units, camps] = await Promise.all([
      prisma.addressUnit.findMany({ where: { id: { in: addressIds } }, select: { id: true, name: true, level: true } }),
      prisma.camp.findMany({ where: { id: { in: campIds } }, select: { id: true, name: true, eventId: true } }),
    ]);

    res.json({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      designation: user.designation,
      roleCode: user.role.code,
      roleName: user.role.name,
      scopeLevel: user.role.scopeLevel,
      department: user.department ? { id: user.department.id, name: user.department.name } : null,
      permissions: principal.permissions,
      scope: principal.scope,
      assignments: [
        ...units.map((u) => ({ type: u.level, id: u.id, name: u.name })),
        ...camps.map((c) => ({ type: 'CAMP', id: c.id, name: c.name, eventId: c.eventId })),
      ],
    });
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) })),
  asyncHandler(async (req, res) => {
    const principal = req.principal!;
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    const user = await prisma.user.findUnique({ where: { id: principal.userId } });
    if (!user) throw ApiError.notFound('User not found');

    await verifyCredentials(user.username, currentPassword);

    const { hashPassword } = await import('../services/auth.service.js');
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });
    // Every other session is invalidated when the password changes.
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await recordAudit({ userId: user.id, action: 'CHANGE_PASSWORD', entityType: 'User', entityId: user.id, req });
    res.status(204).send();
  }),
);
