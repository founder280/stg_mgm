import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS, createUserSchema, paginationSchema, roleCanManage, updateUserSchema, type RoleCode } from '@mgms/shared';
import { prisma } from '../../db.js';
import { ApiError } from '../../errors.js';
import { asyncHandler } from '../../middleware/error-handler.js';
import { requirePermission } from '../../middleware/rbac.js';
import { parsed, validate } from '../../middleware/validate.js';
import { hashPassword } from '../../services/auth.service.js';
import { recordAudit } from '../../services/audit.service.js';
import { param } from '../../lib/params.js';

export const usersRouter: Router = Router();

const listQuerySchema = paginationSchema.extend({
  search: z.string().max(120).optional(),
  roleCode: z.string().max(40).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

usersRouter.get(
  '/',
  requirePermission(PERMISSIONS.USER_READ),
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = parsed(req, listQuerySchema);
    const principal = req.principal!;

    const where: Record<string, unknown> = {};
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { username: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.roleCode) where.role = { code: query.roleCode };
    if (query.isActive) where.isActive = query.isActive === 'true';

    // Non-state users only see staff assigned inside their own area.
    if (principal.scope.level !== 'STATE') {
      const scopeIds = [
        ...principal.scope.districtIds,
        ...principal.scope.campIds,
        ...principal.scope.regionIds,
        ...principal.scope.facilityIds,
      ];
      where.assignments = { some: { scopeId: { in: scopeIds } } };
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { role: true, department: true, assignments: true },
        orderBy: { fullName: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      items: items.map((u) => ({
        id: u.id,
        username: u.username,
        fullName: u.fullName,
        email: u.email,
        mobile: u.mobile,
        designation: u.designation,
        roleCode: u.role.code,
        roleName: u.role.name,
        scopeLevel: u.role.scopeLevel,
        department: u.department?.name ?? null,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        assignmentCount: u.assignments.length,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  }),
);

usersRouter.post(
  '/',
  requirePermission(PERMISSIONS.USER_WRITE),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createUserSchema>;
    const principal = req.principal!;

    const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
    if (!role) throw ApiError.badRequest(`Unknown role ${input.roleCode}`);

    // A user can only create roles their own role is allowed to manage, which
    // stops a district officer from minting a state administrator.
    if (
      principal.roleCode !== 'STATE_SUPER_ADMIN' &&
      !roleCanManage(principal.roleCode as RoleCode, input.roleCode as RoleCode)
    ) {
      throw ApiError.forbidden(`Your role cannot create users with the role ${input.roleCode}`);
    }

    // Assignments must sit inside the creator's own scope.
    if (principal.scope.level !== 'STATE') {
      const allowed = new Set([
        ...principal.scope.districtIds,
        ...principal.scope.campIds,
        ...principal.scope.regionIds,
        ...principal.scope.facilityIds,
      ]);
      const outside = input.assignments.filter((a) => !allowed.has(a.scopeId));
      if (outside.length > 0) throw ApiError.forbidden('You cannot assign a user outside your own area');
    }

    const user = await prisma.user.create({
      data: {
        username: input.username,
        fullName: input.fullName,
        email: input.email,
        mobile: input.mobile,
        passwordHash: await hashPassword(input.password),
        designation: input.designation,
        roleId: role.id,
        departmentId: input.departmentId ?? null,
        isActive: input.isActive,
        mustChangePassword: true,
        createdById: principal.userId,
        assignments: { create: input.assignments.map((a) => ({ scopeType: a.scopeType, scopeId: a.scopeId })) },
      },
      include: { role: true },
    });

    await recordAudit({
      action: 'CREATE_USER',
      entityType: 'User',
      entityId: user.id,
      summary: `${user.username} created with role ${role.code}`,
      req,
    });

    res.status(201).json({ id: user.id, username: user.username, roleCode: user.role.code });
  }),
);

usersRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.USER_WRITE),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof updateUserSchema>;
    const existing = await prisma.user.findUnique({ where: { id: param(req, 'id') }, include: { role: true } });
    if (!existing) throw ApiError.notFound('User not found');

    const roleId = input.roleCode
      ? (await prisma.role.findUnique({ where: { code: input.roleCode } }))?.id
      : undefined;
    if (input.roleCode && !roleId) throw ApiError.badRequest(`Unknown role ${input.roleCode}`);

    const user = await prisma.$transaction(async (tx) => {
      if (input.assignments) {
        await tx.userAssignment.deleteMany({ where: { userId: existing.id } });
        await tx.userAssignment.createMany({
          data: input.assignments.map((a) => ({ userId: existing.id, scopeType: a.scopeType, scopeId: a.scopeId })),
        });
      }
      return tx.user.update({
        where: { id: existing.id },
        data: {
          fullName: input.fullName,
          email: input.email,
          mobile: input.mobile,
          designation: input.designation,
          departmentId: input.departmentId,
          isActive: input.isActive,
          roleId,
        },
      });
    });

    await recordAudit({ action: 'UPDATE_USER', entityType: 'User', entityId: user.id, before: existing, after: input, req });
    res.json({ id: user.id });
  }),
);

usersRouter.post(
  '/:id/reset-password',
  requirePermission(PERMISSIONS.USER_RESET_PASSWORD),
  validate(z.object({ newPassword: z.string().min(8).max(200) })),
  asyncHandler(async (req, res) => {
    const { newPassword } = req.body as { newPassword: string };
    const user = await prisma.user.update({
      where: { id: param(req, 'id') },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: true,
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await recordAudit({ action: 'RESET_PASSWORD', entityType: 'User', entityId: user.id, req });
    res.status(204).send();
  }),
);

export const departmentsRouter: Router = Router();

departmentsRouter.get(
  '/',
  requirePermission(PERMISSIONS.MASTER_READ),
  asyncHandler(async (_req, res) => {
    res.json({ items: await prisma.department.findMany({ orderBy: { name: 'asc' } }) });
  }),
);

departmentsRouter.post(
  '/',
  requirePermission(PERMISSIONS.MASTER_WRITE),
  validate(z.object({ code: z.string().min(2).max(40), name: z.string().min(2).max(160), description: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const department = await prisma.department.create({ data: req.body as never });
    await recordAudit({ action: 'CREATE_DEPARTMENT', entityType: 'Department', entityId: department.id, req });
    res.status(201).json(department);
  }),
);
