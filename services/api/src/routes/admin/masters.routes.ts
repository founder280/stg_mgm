import { Router } from 'express';
import { z } from 'zod';
import {
  ADDRESS_LEVELS,
  DRUG_FORMS,
  EQUIPMENT_MASTER,
  PERMISSIONS,
  addressUnitSchema,
  facilitySchema,
  isValidParent,
  type AddressHierarchy,
  type AddressLevel,
} from '@mgms/shared';
import { prisma } from '../../db.js';
import { ApiError } from '../../errors.js';
import { asyncHandler } from '../../middleware/error-handler.js';
import { requirePermission } from '../../middleware/rbac.js';
import { parsed, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../services/audit.service.js';
import { param } from '../../lib/params.js';

// ---------------------------------------------------------------------------
// Address hierarchy
// ---------------------------------------------------------------------------

export const addressRouter: Router = Router();

const addressQuerySchema = z.object({
  parentId: z.string().uuid().optional(),
  level: z.enum(ADDRESS_LEVELS).optional(),
  hierarchy: z.enum(['ADMIN', 'REVENUE', 'HEALTH']).optional(),
  search: z.string().max(120).optional(),
  roots: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

addressRouter.get(
  '/',
  requirePermission(PERMISSIONS.ADDRESS_READ),
  validate(addressQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = parsed(req, addressQuerySchema);

    const where: Record<string, unknown> = {};
    if (query.parentId) where.parentId = query.parentId;
    if (query.roots === 'true') where.parentId = null;
    if (query.level) where.level = query.level;
    if (query.hierarchy) where.hierarchy = query.hierarchy;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const items = await prisma.addressUnit.findMany({
      where,
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
      take: query.limit,
      include: { _count: { select: { children: true } } },
    });

    res.json({
      items: items.map((u) => ({
        id: u.id,
        code: u.code,
        name: u.name,
        nameLocal: u.nameLocal,
        level: u.level,
        hierarchy: u.hierarchy,
        parentId: u.parentId,
        latitude: u.latitude,
        longitude: u.longitude,
        population: u.population,
        childCount: u._count.children,
      })),
    });
  }),
);

/** Ancestor chain for a unit — powers the breadcrumb in the map picker. */
addressRouter.get(
  '/:id/ancestors',
  requirePermission(PERMISSIONS.ADDRESS_READ),
  asyncHandler(async (req, res) => {
    const unit = await prisma.addressUnit.findUnique({ where: { id: param(req, 'id') } });
    if (!unit) throw ApiError.notFound('Address unit not found');

    const ancestorIds = unit.path.split('/').filter(Boolean);
    const ancestors = await prisma.addressUnit.findMany({
      where: { id: { in: ancestorIds } },
      select: { id: true, name: true, level: true },
    });
    // Restore the path's own ordering, which the IN query does not preserve.
    const byId = new Map(ancestors.map((a) => [a.id, a]));
    res.json({
      ancestors: ancestorIds.map((id) => byId.get(id)).filter(Boolean),
      unit: { id: unit.id, name: unit.name, level: unit.level },
    });
  }),
);

addressRouter.post(
  '/',
  requirePermission(PERMISSIONS.ADDRESS_WRITE),
  validate(addressUnitSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof addressUnitSchema>;

    const parent = input.parentId
      ? await prisma.addressUnit.findUnique({ where: { id: input.parentId } })
      : null;
    if (input.parentId && !parent) throw ApiError.badRequest('Parent address unit not found');

    if (!isValidParent(input.hierarchy as AddressHierarchy, input.level as AddressLevel, (parent?.level ?? null) as AddressLevel | null)) {
      throw ApiError.unprocessable(
        `A ${input.level} cannot sit under a ${parent?.level ?? 'root'} in the ${input.hierarchy} hierarchy`,
      );
    }

    const path = parent ? `${parent.path}${parent.id}/` : '';
    const unit = await prisma.addressUnit.create({
      data: {
        code: input.code,
        name: input.name,
        nameLocal: input.nameLocal,
        level: input.level as never,
        hierarchy: input.hierarchy as never,
        parentId: input.parentId ?? null,
        path,
        depth: path.split('/').filter(Boolean).length,
        lgdCode: input.lgdCode,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        population: input.population ?? null,
        boundary: (input.boundary ?? null) as never,
      },
    });

    await recordAudit({ action: 'CREATE_ADDRESS_UNIT', entityType: 'AddressUnit', entityId: unit.id, after: input, req });
    res.status(201).json(unit);
  }),
);

addressRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.ADDRESS_WRITE),
  validate(addressUnitSchema.partial()),
  asyncHandler(async (req, res) => {
    const input = req.body as Partial<z.infer<typeof addressUnitSchema>>;
    // Re-parenting would invalidate every descendant's materialised path, so
    // it is handled by a dedicated move endpoint rather than a field update.
    if ('parentId' in input) throw ApiError.badRequest('Use POST /address/:id/move to change the parent');

    const unit = await prisma.addressUnit.update({
      where: { id: param(req, 'id') },
      data: {
        name: input.name,
        nameLocal: input.nameLocal,
        lgdCode: input.lgdCode,
        latitude: input.latitude,
        longitude: input.longitude,
        population: input.population,
        boundary: input.boundary === undefined ? undefined : (input.boundary as never),
      },
    });
    await recordAudit({ action: 'UPDATE_ADDRESS_UNIT', entityType: 'AddressUnit', entityId: unit.id, after: input, req });
    res.json(unit);
  }),
);

addressRouter.post(
  '/:id/move',
  requirePermission(PERMISSIONS.ADDRESS_WRITE),
  validate(z.object({ parentId: z.string().uuid().nullable() })),
  asyncHandler(async (req, res) => {
    const { parentId } = req.body as { parentId: string | null };
    const unit = await prisma.addressUnit.findUnique({ where: { id: param(req, 'id') } });
    if (!unit) throw ApiError.notFound('Address unit not found');

    const parent = parentId ? await prisma.addressUnit.findUnique({ where: { id: parentId } }) : null;
    if (parentId && !parent) throw ApiError.badRequest('Parent address unit not found');
    if (parent && (parent.id === unit.id || parent.path.includes(unit.id))) {
      throw ApiError.unprocessable('A unit cannot be moved beneath itself');
    }
    if (!isValidParent(unit.hierarchy, unit.level, parent?.level ?? null)) {
      throw ApiError.unprocessable(`A ${unit.level} cannot sit under a ${parent?.level ?? 'root'}`);
    }

    const oldPrefix = `${unit.path}${unit.id}/`;
    const newPath = parent ? `${parent.path}${parent.id}/` : '';
    const newPrefix = `${newPath}${unit.id}/`;

    await prisma.$transaction(async (tx) => {
      await tx.addressUnit.update({
        where: { id: unit.id },
        data: { parentId, path: newPath, depth: newPath.split('/').filter(Boolean).length },
      });
      // Rewrite every descendant's path in one statement.
      await tx.$executeRaw`
        UPDATE address_units
        SET path = ${newPrefix} || substring(path from ${oldPrefix.length + 1})
        WHERE path LIKE ${`${oldPrefix}%`}
      `;
    });

    await recordAudit({ action: 'MOVE_ADDRESS_UNIT', entityType: 'AddressUnit', entityId: unit.id, after: { parentId }, req });
    res.json({ id: unit.id, parentId, path: newPath });
  }),
);

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

export const facilitiesRouter: Router = Router();

const facilityQuerySchema = z.object({
  type: z.string().optional(),
  districtId: z.string().uuid().optional(),
  speciality: z.string().optional(),
  empanelledOnly: z.enum(['true', 'false']).optional(),
  search: z.string().max(120).optional(),
});

facilitiesRouter.get(
  '/',
  requirePermission(PERMISSIONS.FACILITY_READ),
  validate(facilityQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = parsed(req, facilityQuerySchema);
    const where: Record<string, unknown> = { isActive: true };
    if (query.type) where.type = query.type;
    if (query.districtId) where.districtId = query.districtId;
    if (query.speciality) where.specialities = { has: query.speciality };
    if (query.empanelledOnly === 'true') where.isEmpanelled = true;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const items = await prisma.facility.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { district: { select: { id: true, name: true } } },
    });
    res.json({ items });
  }),
);

facilitiesRouter.post(
  '/',
  requirePermission(PERMISSIONS.FACILITY_WRITE),
  validate(facilitySchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof facilitySchema>;
    const facility = await prisma.facility.create({ data: { ...input, type: input.type as never } });
    await recordAudit({ action: 'CREATE_FACILITY', entityType: 'Facility', entityId: facility.id, after: input, req });
    res.status(201).json(facility);
  }),
);

facilitiesRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.FACILITY_WRITE),
  validate(facilitySchema.partial()),
  asyncHandler(async (req, res) => {
    const input = req.body as Partial<z.infer<typeof facilitySchema>>;
    const facility = await prisma.facility.update({
      where: { id: param(req, 'id') },
      data: { ...input, type: input.type as never },
    });
    await recordAudit({ action: 'UPDATE_FACILITY', entityType: 'Facility', entityId: facility.id, after: input, req });
    res.json(facility);
  }),
);

// ---------------------------------------------------------------------------
// Clinical and logistics masters
// ---------------------------------------------------------------------------

export const mastersRouter: Router = Router();

mastersRouter.get(
  '/symptoms',
  requirePermission(PERMISSIONS.MASTER_READ),
  asyncHandler(async (_req, res) => {
    res.json({ items: await prisma.symptom.findMany({ orderBy: { displayOrder: 'asc' } }) });
  }),
);

mastersRouter.patch(
  '/symptoms/:id',
  requirePermission(PERMISSIONS.MASTER_WRITE),
  validate(
    z.object({
      name: z.string().min(1).max(120).optional(),
      nameLocal: z.string().max(120).optional(),
      isActive: z.boolean().optional(),
      displayOrder: z.number().int().optional(),
      redFlag: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const symptom = await prisma.symptom.update({ where: { id: param(req, 'id') }, data: req.body as never });
    await recordAudit({ action: 'UPDATE_SYMPTOM', entityType: 'Symptom', entityId: symptom.id, after: req.body, req });
    res.json(symptom);
  }),
);

mastersRouter.get(
  '/syndromes',
  requirePermission(PERMISSIONS.MASTER_READ),
  asyncHandler(async (_req, res) => {
    res.json({ items: await prisma.syndromeDefinition.findMany({ orderBy: { priority: 'desc' } }) });
  }),
);

mastersRouter.get(
  '/drugs',
  requirePermission(PERMISSIONS.MASTER_READ),
  asyncHandler(async (_req, res) => {
    res.json({ items: await prisma.drug.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }) });
  }),
);

mastersRouter.post(
  '/drugs',
  requirePermission(PERMISSIONS.MASTER_WRITE),
  validate(
    z.object({
      code: z.string().min(1).max(40),
      name: z.string().min(2).max(160),
      genericName: z.string().min(2).max(160),
      form: z.enum(DRUG_FORMS),
      strength: z.string().max(60).optional(),
      emergencyTray: z.boolean().default(false),
      reorderLevel: z.number().int().nonnegative().default(0),
    }),
  ),
  asyncHandler(async (req, res) => {
    const drug = await prisma.drug.create({ data: req.body as never });
    await recordAudit({ action: 'CREATE_DRUG', entityType: 'Drug', entityId: drug.id, after: req.body, req });
    res.status(201).json(drug);
  }),
);

mastersRouter.get(
  '/equipment',
  requirePermission(PERMISSIONS.MASTER_READ),
  asyncHandler(async (_req, res) => {
    res.json({ items: EQUIPMENT_MASTER });
  }),
);
