import { Router } from 'express';
import { z } from 'zod';
import {
  PERMISSIONS,
  WALKIN_STAGES,
  clinicalSchema,
  paginationSchema,
  registrationSchema,
  suggestSamples,
  suggestTreatment,
  vitalsSchema,
  type WalkInStage,
} from '@mgms/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { ApiError } from '../errors.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { requirePermission } from '../middleware/rbac.js';
import { parsed, validate } from '../middleware/validate.js';
import { recordAudit } from '../services/audit.service.js';
import { assertCampAccess, scopeWhere } from '../services/scope.service.js';
import {
  dispensePrescription,
  recordClinical,
  recordVitals,
  registerWalkIn,
  transitionStage,
} from '../services/walkin.service.js';
import { param } from '../lib/params.js';

export const walkInsRouter: Router = Router();

const listQuerySchema = paginationSchema.extend({
  campId: z.string().uuid().optional(),
  stage: z.enum(WALKIN_STAGES).optional(),
  triageLevel: z.enum(['GREEN', 'YELLOW', 'ORANGE', 'RED']).optional(),
  syndromeCode: z.string().max(40).optional(),
  search: z.string().max(60).optional(),
  waiting: z.enum(['true', 'false']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

walkInsRouter.get(
  '/',
  requirePermission(PERMISSIONS.WALKIN_READ),
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = parsed(req, listQuerySchema);
    const scope = req.principal!.scope;

    const and: Prisma.WalkInWhereInput[] = [scopeWhere(scope) as Prisma.WalkInWhereInput];
    if (query.campId) and.push({ campId: query.campId });
    if (query.stage) and.push({ stage: query.stage });
    if (query.triageLevel) and.push({ triageLevel: query.triageLevel });
    if (query.syndromeCode) and.push({ primarySyndromeCode: query.syndromeCode });
    if (query.waiting === 'true') and.push({ stage: { in: ['REGISTERED', 'VITALS_DONE'] } });
    if (query.search) {
      and.push({
        OR: [
          { tokenNumber: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search.toUpperCase() } },
        ],
      });
    }
    if (query.from || query.to) {
      and.push({
        registeredAt: {
          ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
          ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
        },
      });
    }

    const where: Prisma.WalkInWhereInput = { AND: and };

    const [items, total] = await Promise.all([
      prisma.walkIn.findMany({
        where,
        orderBy: [{ triageLevel: 'desc' }, { registeredAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          tokenNumber: true,
          name: true,
          ageYears: true,
          ageBand: true,
          gender: true,
          stage: true,
          triageLevel: true,
          triageScore: true,
          primarySyndromeCode: true,
          registeredAt: true,
          camp: { select: { id: true, name: true } },
        },
      }),
      prisma.walkIn.count({ where }),
    ]);

    res.json({ items, page: query.page, pageSize: query.pageSize, total });
  }),
);

/** The full record, and the decision support the medical officer sees with it. */
walkInsRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.WALKIN_READ),
  asyncHandler(async (req, res) => {
    const walkIn = await prisma.walkIn.findUnique({
      where: { id: param(req, 'id') },
      include: {
        camp: { select: { id: true, name: true, code: true } },
        district: { select: { id: true, name: true } },
        residenceUnit: { select: { id: true, name: true, level: true } },
        onsetZone: { select: { id: true, name: true } },
        symptoms: { include: { symptom: true } },
        injuries: true,
        bites: true,
        syndromes: { include: { syndrome: true } },
        vitals: true,
        clinical: true,
        labOrder: { include: { labFacility: { select: { id: true, name: true } } } },
        prescriptionLines: true,
        referral: { include: { facility: { select: { id: true, name: true, contactPhone: true } } } },
        registeredBy: { select: { id: true, fullName: true } },
      },
    });
    if (!walkIn) throw ApiError.notFound('Walk-in not found');
    await assertCampAccess(req.principal!.scope, walkIn.campId);

    const inventory = await prisma.campInventory.findMany({
      where: { campId: walkIn.campId },
      include: { drug: { select: { code: true } } },
    });

    const syndromeCodes = walkIn.syndromes.map((s) => s.syndromeCode);
    const symptomCodes = walkIn.symptoms.map((s) => s.symptomCode);

    res.json({
      walkIn,
      decisionSupport: {
        suggestedSamples: suggestSamples(syndromeCodes, symptomCodes),
        suggestedTreatment: suggestTreatment(
          walkIn.primarySyndromeCode,
          inventory.map((i) => ({ drugCode: i.drug.code, availableQuantity: i.onHand })),
        ),
      },
    });
  }),
);

/** Screens 1-5 — the volunteer's leg of the split form. */
walkInsRouter.post(
  '/',
  requirePermission(PERMISSIONS.WALKIN_REGISTER),
  validate(registrationSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof registrationSchema>;
    await assertCampAccess(req.principal!.scope, input.campId);

    const result = await registerWalkIn(input, {
      userId: req.principal!.userId,
      ipAddress: req.ip,
    });

    await recordAudit({
      action: result.duplicate ? 'REGISTER_WALKIN_DUPLICATE' : 'REGISTER_WALKIN',
      entityType: 'WalkIn',
      entityId: result.walkInId,
      summary: `Token ${result.tokenNumber}`,
      req,
    });

    res.status(result.duplicate ? 200 : 201).json(result);
  }),
);

/** Screen 6 — the paramedic's leg. */
walkInsRouter.post(
  '/:id/vitals',
  requirePermission(PERMISSIONS.WALKIN_VITALS),
  validate(vitalsSchema),
  asyncHandler(async (req, res) => {
    const walkIn = await prisma.walkIn.findUnique({ where: { id: param(req, 'id') }, select: { campId: true } });
    if (!walkIn) throw ApiError.notFound('Walk-in not found');
    await assertCampAccess(req.principal!.scope, walkIn.campId);

    const result = await recordVitals(param(req, 'id'), req.body as z.infer<typeof vitalsSchema>, req.principal!.userId);
    await recordAudit({ action: 'RECORD_VITALS', entityType: 'WalkIn', entityId: param(req, 'id'), req });
    res.json(result);
  }),
);

/** Screens 7-9 — the medical officer's leg. */
walkInsRouter.post(
  '/:id/clinical',
  requirePermission(PERMISSIONS.WALKIN_CLINICAL),
  validate(clinicalSchema),
  asyncHandler(async (req, res) => {
    const walkIn = await prisma.walkIn.findUnique({ where: { id: param(req, 'id') }, select: { campId: true } });
    if (!walkIn) throw ApiError.notFound('Walk-in not found');
    await assertCampAccess(req.principal!.scope, walkIn.campId);

    const result = await recordClinical(param(req, 'id'), req.body as z.infer<typeof clinicalSchema>, req.principal!.userId);
    await recordAudit({ action: 'RECORD_CLINICAL', entityType: 'WalkIn', entityId: param(req, 'id'), req });
    res.json(result);
  }),
);

walkInsRouter.post(
  '/:id/dispense',
  requirePermission(PERMISSIONS.WALKIN_DISPENSE),
  asyncHandler(async (req, res) => {
    const walkIn = await prisma.walkIn.findUnique({ where: { id: param(req, 'id') }, select: { campId: true } });
    if (!walkIn) throw ApiError.notFound('Walk-in not found');
    await assertCampAccess(req.principal!.scope, walkIn.campId);

    const result = await dispensePrescription(param(req, 'id'), req.principal!.userId);
    await recordAudit({ action: 'DISPENSE', entityType: 'WalkIn', entityId: param(req, 'id'), req });
    res.json(result);
  }),
);

walkInsRouter.post(
  '/:id/stage',
  requirePermission(PERMISSIONS.WALKIN_CLINICAL),
  validate(z.object({ stage: z.enum(WALKIN_STAGES) })),
  asyncHandler(async (req, res) => {
    const { stage } = req.body as { stage: WalkInStage };
    const walkIn = await prisma.walkIn.findUnique({ where: { id: param(req, 'id') }, select: { campId: true } });
    if (!walkIn) throw ApiError.notFound('Walk-in not found');
    await assertCampAccess(req.principal!.scope, walkIn.campId);

    const updated = await transitionStage(param(req, 'id'), stage);
    res.json({ id: updated.id, stage: updated.stage });
  }),
);

/** Line listing export for the surveillance unit. */
walkInsRouter.get(
  '/export/csv',
  requirePermission(PERMISSIONS.WALKIN_EXPORT),
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = parsed(req, listQuerySchema);
    const scope = req.principal!.scope;

    const and: Prisma.WalkInWhereInput[] = [scopeWhere(scope) as Prisma.WalkInWhereInput];
    if (query.campId) and.push({ campId: query.campId });
    if (query.from || query.to) {
      and.push({
        registeredAt: {
          ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
          ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
        },
      });
    }

    const rows = await prisma.walkIn.findMany({
      where: { AND: and },
      orderBy: { registeredAt: 'asc' },
      take: 50_000,
      include: {
        camp: { select: { name: true } },
        district: { select: { name: true } },
        residenceUnit: { select: { name: true } },
        symptoms: true,
        vitals: true,
      },
    });

    const headers = [
      'token', 'registered_at', 'camp', 'district', 'age_years', 'age_band', 'gender',
      'residence_type', 'residence_unit', 'stay_days', 'symptoms', 'primary_syndrome',
      'triage', 'stage', 'temperature_f', 'systolic', 'diastolic', 'pulse',
    ];

    const escape = (value: unknown) => {
      const s = value == null ? '' : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(
        [
          row.tokenNumber,
          row.registeredAt.toISOString(),
          row.camp.name,
          row.district.name,
          row.ageYears,
          row.ageBand,
          row.gender,
          row.residenceType,
          row.residenceUnit?.name ?? row.residenceText ?? '',
          row.stayTotalDays,
          row.symptoms.map((s) => s.symptomCode).join('|'),
          row.primarySyndromeCode ?? '',
          row.triageLevel,
          row.stage,
          row.vitals?.temperatureF ?? '',
          row.vitals?.systolic ?? '',
          row.vitals?.diastolic ?? '',
          row.vitals?.pulse ?? '',
        ]
          .map(escape)
          .join(','),
      );
    }

    await recordAudit({
      action: 'EXPORT_WALKINS',
      entityType: 'WalkIn',
      summary: `${rows.length} records exported`,
      req,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="walk-ins-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join('\n'));
  }),
);
