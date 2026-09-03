import { Router } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  attendanceSchema,
  campSchema,
  eventSchema,
  readinessSchema,
  rosterEntrySchema,
  stockTransactionSchema,
  zoneSchema,
} from '@mgms/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { ApiError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requirePermission } from '../middleware/rbac.js';
import { parsed, validate } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.service.js';
import { adjustStock, stockProjections } from '../services/inventory.service.js';
import { assertCampAccess, campScopeWhere } from '../services/scope.service.js';
import { param } from '../lib/params.js';

export const eventsRouter: Router = Router();

eventsRouter.get(
  '/',
  requirePermission(PERMISSIONS.EVENT_READ),
  asyncHandler(async (_req, res) => {
    const items = await prisma.event.findMany({
      orderBy: { startDate: 'desc' },
      include: {
        districts: { include: { district: { select: { id: true, name: true } } } },
        _count: { select: { camps: true, walkIns: true } },
      },
    });
    res.json({
      items: items.map((e) => ({
        id: e.id,
        code: e.code,
        name: e.name,
        description: e.description,
        startDate: e.startDate,
        endDate: e.endDate,
        expectedFootfall: e.expectedFootfall,
        stayReferenceDate: e.stayReferenceDate,
        isActive: e.isActive,
        districts: e.districts.map((d) => d.district),
        campCount: e._count.camps,
        walkInCount: e._count.walkIns,
      })),
    });
  }),
);

eventsRouter.post(
  '/',
  requirePermission(PERMISSIONS.EVENT_WRITE),
  validate(eventSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof eventSchema>;
    if (input.endDate < input.startDate) throw ApiError.badRequest('The end date cannot precede the start date');

    const event = await prisma.event.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        startDate: input.startDate,
        endDate: input.endDate,
        expectedFootfall: input.expectedFootfall ?? null,
        stayReferenceDate: input.stayReferenceDate ?? input.startDate,
        isActive: input.isActive,
        districts: { create: input.districtIds.map((districtId) => ({ districtId })) },
      },
    });
    await recordAudit({ action: 'CREATE_EVENT', entityType: 'Event', entityId: event.id, after: input, req });
    res.status(201).json(event);
  }),
);

eventsRouter.get(
  '/:id/zones',
  requirePermission(PERMISSIONS.EVENT_READ),
  asyncHandler(async (req, res) => {
    const items = await prisma.eventZone.findMany({
      where: { eventId: param(req, 'id') },
      orderBy: { name: 'asc' },
    });
    res.json({ items });
  }),
);

eventsRouter.post(
  '/:id/zones',
  requirePermission(PERMISSIONS.EVENT_WRITE),
  validate(zoneSchema.omit({ eventId: true })),
  asyncHandler(async (req, res) => {
    const zone = await prisma.eventZone.create({
      data: { ...(req.body as object), eventId: param(req, 'id'), boundary: undefined } as never,
    });
    await recordAudit({ action: 'CREATE_ZONE', entityType: 'EventZone', entityId: zone.id, req });
    res.status(201).json(zone);
  }),
);

// ---------------------------------------------------------------------------
// Camps
// ---------------------------------------------------------------------------

export const campsRouter: Router = Router();

const campQuerySchema = z.object({
  eventId: z.string().uuid().optional(),
  districtId: z.string().uuid().optional(),
  activeOnly: z.enum(['true', 'false']).optional(),
});

campsRouter.get(
  '/',
  requirePermission(PERMISSIONS.CAMP_READ),
  validate(campQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = parsed(req, campQuerySchema);
    const scope = req.principal!.scope;

    const where: Prisma.CampWhereInput = { ...(campScopeWhere(scope) as Prisma.CampWhereInput) };
    if (query.eventId) where.eventId = query.eventId;
    if (query.districtId) where.districtId = query.districtId;
    if (query.activeOnly === 'true') where.isActive = true;

    const items = await prisma.camp.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        district: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true } },
        incharge: { select: { id: true, fullName: true, mobile: true } },
        event: { select: { id: true, name: true } },
        _count: { select: { walkIns: true } },
      },
    });
    res.json({ items });
  }),
);

campsRouter.post(
  '/',
  requirePermission(PERMISSIONS.CAMP_WRITE),
  validate(campSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof campSchema>;
    const camp = await prisma.camp.create({ data: { ...input, type: input.type as never } });
    await recordAudit({ action: 'CREATE_CAMP', entityType: 'Camp', entityId: camp.id, after: input, req });
    res.status(201).json(camp);
  }),
);

campsRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.CAMP_WRITE),
  validate(campSchema.partial().omit({ eventId: true })),
  asyncHandler(async (req, res) => {
    await assertCampAccess(req.principal!.scope, param(req, 'id'));
    const input = req.body as Partial<z.infer<typeof campSchema>>;
    const camp = await prisma.camp.update({
      where: { id: param(req, 'id') },
      data: { ...input, type: input.type as never },
    });
    await recordAudit({ action: 'UPDATE_CAMP', entityType: 'Camp', entityId: camp.id, after: input, req });
    res.json(camp);
  }),
);

// --- Roster and attendance ---

campsRouter.get(
  '/:id/roster',
  requirePermission(PERMISSIONS.ROSTER_READ),
  validate(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }), 'query'),
  asyncHandler(async (req, res) => {
    await assertCampAccess(req.principal!.scope, param(req, 'id'));
    const query = parsed(req, z.object({ date: z.string().optional() }));
    const dutyDate = new Date(query.date ?? new Date().toISOString().slice(0, 10));

    const items = await prisma.rosterEntry.findMany({
      where: { campId: param(req, 'id'), dutyDate },
      include: {
        user: { select: { id: true, fullName: true, designation: true, mobile: true, role: { select: { code: true, name: true } } } },
        attendance: true,
      },
      orderBy: [{ shift: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ dutyDate, items });
  }),
);

campsRouter.post(
  '/:id/roster',
  requirePermission(PERMISSIONS.ROSTER_WRITE),
  validate(rosterEntrySchema.omit({ campId: true })),
  asyncHandler(async (req, res) => {
    await assertCampAccess(req.principal!.scope, param(req, 'id'));
    const input = req.body as Omit<z.infer<typeof rosterEntrySchema>, 'campId'>;
    const entry = await prisma.rosterEntry.create({
      data: {
        campId: param(req, 'id'),
        userId: input.userId,
        dutyDate: new Date(input.dutyDate),
        shift: input.shift as never,
        role: input.role,
      },
    });
    res.status(201).json(entry);
  }),
);

campsRouter.post(
  '/roster/:entryId/attendance',
  requirePermission(PERMISSIONS.ROSTER_WRITE),
  validate(attendanceSchema.omit({ rosterEntryId: true })),
  asyncHandler(async (req, res) => {
    const input = req.body as Omit<z.infer<typeof attendanceSchema>, 'rosterEntryId'>;
    const entry = await prisma.rosterEntry.findUnique({ where: { id: param(req, 'entryId') } });
    if (!entry) throw ApiError.notFound('Roster entry not found');
    await assertCampAccess(req.principal!.scope, entry.campId);

    const attendance = await prisma.attendance.upsert({
      where: { rosterEntryId: entry.id },
      create: {
        rosterEntryId: entry.id,
        status: input.status,
        markedById: req.principal!.userId,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        remarks: input.remarks,
      },
      update: { status: input.status, markedById: req.principal!.userId, remarks: input.remarks },
    });
    res.json(attendance);
  }),
);

// --- Pre-camp readiness ---

campsRouter.get(
  '/:id/readiness',
  requirePermission(PERMISSIONS.READINESS_READ),
  asyncHandler(async (req, res) => {
    await assertCampAccess(req.principal!.scope, param(req, 'id'));
    const items = await prisma.campReadiness.findMany({
      where: { campId: param(req, 'id') },
      orderBy: { reportDate: 'desc' },
      take: 14,
      include: { equipment: true, photos: true },
    });
    res.json({ items });
  }),
);

campsRouter.post(
  '/:id/readiness',
  requirePermission(PERMISSIONS.READINESS_WRITE),
  validate(readinessSchema.omit({ campId: true })),
  asyncHandler(async (req, res) => {
    await assertCampAccess(req.principal!.scope, param(req, 'id'));
    const input = req.body as Omit<z.infer<typeof readinessSchema>, 'campId'>;
    const reportDate = new Date(input.reportDate);

    const functional = input.equipment.filter((e) => e.status === 'FUNCTIONAL').length;
    const readinessPercent =
      input.equipment.length > 0 ? Math.round((functional / input.equipment.length) * 100) : null;

    const readiness = await prisma.$transaction(async (tx) => {
      const existing = await tx.campReadiness.findUnique({
        where: { campId_reportDate: { campId: param(req, 'id'), reportDate } },
      });
      if (existing) {
        await tx.readinessEquipment.deleteMany({ where: { readinessId: existing.id } });
        await tx.campPhoto.deleteMany({ where: { readinessId: existing.id } });
      }

      return tx.campReadiness.upsert({
        where: { campId_reportDate: { campId: param(req, 'id'), reportDate } },
        create: {
          campId: param(req, 'id'),
          reportDate,
          venueReady: input.venueReady,
          venueRemarks: input.venueRemarks,
          waterAvailable: input.waterAvailable,
          powerAvailable: input.powerAvailable,
          wasteDisposalReady: input.wasteDisposalReady,
          feedback: input.feedback,
          reportedById: req.principal!.userId,
          readinessPercent,
          equipment: { create: input.equipment.map((e) => ({ ...e, status: e.status as never })) },
          photos: { create: input.photos },
        },
        update: {
          venueReady: input.venueReady,
          venueRemarks: input.venueRemarks,
          waterAvailable: input.waterAvailable,
          powerAvailable: input.powerAvailable,
          wasteDisposalReady: input.wasteDisposalReady,
          feedback: input.feedback,
          reportedById: req.principal!.userId,
          readinessPercent,
          equipment: { create: input.equipment.map((e) => ({ ...e, status: e.status as never })) },
          photos: { create: input.photos },
        },
        include: { equipment: true, photos: true },
      });
    });

    await recordAudit({ action: 'SUBMIT_READINESS', entityType: 'CampReadiness', entityId: readiness.id, req });
    res.status(201).json(readiness);
  }),
);

// --- Inventory ---

campsRouter.get(
  '/:id/inventory',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  asyncHandler(async (req, res) => {
    await assertCampAccess(req.principal!.scope, param(req, 'id'));
    const [items, projections] = await Promise.all([
      prisma.campInventory.findMany({
        where: { campId: param(req, 'id') },
        include: { drug: true },
        orderBy: { drug: { name: 'asc' } },
      }),
      stockProjections([param(req, 'id')]),
    ]);

    const projectionByCode = new Map(projections.map((p) => [p.drugCode, p]));
    res.json({
      items: items.map((i) => ({
        id: i.id,
        drugId: i.drugId,
        drugCode: i.drug.code,
        drugName: i.drug.name,
        form: i.drug.form,
        strength: i.drug.strength,
        emergencyTray: i.drug.emergencyTray,
        onHand: i.onHand,
        reorderLevel: i.drug.reorderLevel,
        batchNumber: i.batchNumber,
        expiryDate: i.expiryDate,
        projection: projectionByCode.get(i.drug.code) ?? null,
      })),
    });
  }),
);

campsRouter.post(
  '/:id/inventory/transactions',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  validate(stockTransactionSchema.omit({ campId: true })),
  asyncHandler(async (req, res) => {
    await assertCampAccess(req.principal!.scope, param(req, 'id'));
    const input = req.body as Omit<z.infer<typeof stockTransactionSchema>, 'campId'>;

    // A receipt adds, an issue or expiry removes — the sign is derived from the
    // transaction type so a client can never send a sign that contradicts it.
    const magnitude = Math.abs(input.quantity);
    const signed = input.type === 'RECEIPT' || input.type === 'RETURN' ? magnitude : -magnitude;
    const quantity = input.type === 'ADJUSTMENT' ? input.quantity : signed;

    const result = await adjustStock({
      campId: param(req, 'id'),
      drugId: input.drugId,
      quantity,
      type: input.type,
      batchNumber: input.batchNumber,
      reference: input.reference,
      remarks: input.remarks,
      userId: req.principal!.userId,
    });

    if (!result.ok) {
      throw ApiError.unprocessable(
        `Insufficient stock: ${result.available} units available, ${magnitude} requested`,
      );
    }

    await recordAudit({ action: 'STOCK_TRANSACTION', entityType: 'Camp', entityId: param(req, 'id'), after: input, req });
    res.status(201).json(result);
  }),
);
