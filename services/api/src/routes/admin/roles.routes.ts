import { Router } from 'express';
import { z } from 'zod';
import { ALL_PERMISSIONS, PERMISSIONS, createRoleSchema, moduleOf, updateRoleSchema } from '@mgms/shared';
import { prisma } from '../../db.js';
import { ApiError } from '../../errors.js';
import { asyncHandler } from '../../middleware/error-handler.js';
import { requirePermission } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { recordAudit } from '../../services/audit.service.js';
import { param } from '../../lib/params.js';

export const rolesRouter: Router = Router();

rolesRouter.get(
  '/permissions',
  requirePermission(PERMISSIONS.ROLE_READ),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
    const grouped = new Map<string, Array<{ id: string; code: string; description: string | null }>>();
    for (const row of rows) {
      const list = grouped.get(row.module) ?? [];
      list.push({ id: row.id, code: row.code, description: row.description });
      grouped.set(row.module, list);
    }
    res.json({ modules: [...grouped.entries()].map(([module, permissions]) => ({ module, permissions })) });
  }),
);

rolesRouter.get(
  '/',
  requirePermission(PERMISSIONS.ROLE_READ),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({
      orderBy: { scopeLevel: 'asc' },
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
    });
    res.json({
      items: roles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        scopeLevel: r.scopeLevel,
        isSystem: r.isSystem,
        isActive: r.isActive,
        userCount: r._count.users,
        permissions: r.permissions.map((p) => p.permission.code),
      })),
    });
  }),
);

rolesRouter.post(
  '/',
  requirePermission(PERMISSIONS.ROLE_WRITE),
  validate(createRoleSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createRoleSchema>;
    const unknown = input.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as never));
    if (unknown.length > 0) throw ApiError.badRequest(`Unknown permissions: ${unknown.join(', ')}`);

    const permissionRows = await prisma.permission.findMany({ where: { code: { in: input.permissions } } });

    const role = await prisma.role.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        scopeLevel: input.scopeLevel,
        permissions: { create: permissionRows.map((p) => ({ permissionId: p.id })) },
      },
    });

    await recordAudit({ action: 'CREATE_ROLE', entityType: 'Role', entityId: role.id, after: input, req });
    res.status(201).json(role);
  }),
);

rolesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.ROLE_WRITE),
  validate(updateRoleSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof updateRoleSchema>;
    const existing = await prisma.role.findUnique({ where: { id: param(req, 'id') } });
    if (!existing) throw ApiError.notFound('Role not found');

    // System roles carry the platform's guarantees; their permission sets are
    // fixed so an administrator cannot lock everyone out of the console.
    if (existing.isSystem && input.permissions) {
      throw ApiError.forbidden('Permissions of a built-in role cannot be changed. Create a custom role instead.');
    }

    const role = await prisma.$transaction(async (tx) => {
      if (input.permissions) {
        const permissionRows = await tx.permission.findMany({ where: { code: { in: input.permissions } } });
        await tx.rolePermission.deleteMany({ where: { roleId: existing.id } });
        await tx.rolePermission.createMany({
          data: permissionRows.map((p) => ({ roleId: existing.id, permissionId: p.id })),
        });
      }
      return tx.role.update({
        where: { id: existing.id },
        data: { name: input.name, description: input.description, scopeLevel: input.scopeLevel },
      });
    });

    await recordAudit({
      action: 'UPDATE_ROLE',
      entityType: 'Role',
      entityId: role.id,
      before: existing,
      after: input,
      req,
    });
    res.json(role);
  }),
);

rolesRouter.get(
  '/matrix',
  requirePermission(PERMISSIONS.ROLE_READ),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { scopeLevel: 'asc' },
    });
    res.json({
      permissions: ALL_PERMISSIONS.map((code) => ({ code, module: moduleOf(code) })),
      roles: roles.map((r) => ({
        code: r.code,
        name: r.name,
        scopeLevel: r.scopeLevel,
        permissions: r.permissions.map((p) => p.permission.code),
      })),
    });
  }),
);
