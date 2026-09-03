import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@mgms/shared';
import type { DashboardFilter } from '@mgms/shared';
import { asyncHandler } from '../middleware/error-handler.js';
import { requirePermission } from '../middleware/rbac.js';
import { parsed, validate } from '../middleware/validate.js';
import { buildSnapshot, snapshotBounds } from '../services/dashboard.service.js';
import { runAnalytics } from '../services/analytics.service.js';
import { acknowledgeAlert, listAlerts } from '../services/alert.service.js';
import { recordAudit } from '../services/audit.service.js';
import { param } from '../lib/params.js';

export const dashboardRouter: Router = Router();

/** Comma-separated query parameters become arrays. */
const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').filter(Boolean) : undefined));

const filterSchema = z.object({
  eventId: z.string().uuid().optional(),
  campIds: csv,
  districtIds: csv,
  zoneIds: csv,
  syndromeCodes: csv,
  symptomCodes: csv,
  genders: csv,
  ageBands: csv,
  triageLevels: csv,
  residenceTypes: csv,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

dashboardRouter.get(
  '/',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  validate(filterSchema, 'query'),
  asyncHandler(async (req, res) => {
    const filter = parsed(req, filterSchema) as DashboardFilter;
    res.json(await buildSnapshot(filter, req.principal!.scope));
  }),
);

dashboardRouter.get(
  '/bounds',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  validate(filterSchema, 'query'),
  asyncHandler(async (req, res) => {
    const filter = parsed(req, filterSchema) as DashboardFilter;
    res.json({ bounds: await snapshotBounds(filter, req.principal!.scope) });
  }),
);

dashboardRouter.post(
  '/analytics/run',
  requirePermission(PERMISSIONS.ANALYTICS_RUN),
  asyncHandler(async (req, res) => {
    const result = await runAnalytics();
    await recordAudit({ action: 'RUN_ANALYTICS', entityType: 'Event', summary: JSON.stringify(result), req });
    res.json(result);
  }),
);

export const alertsRouter: Router = Router();

const alertQuerySchema = z.object({
  eventId: z.string().uuid().optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional(),
  type: z
    .enum(['ABERRATION', 'SPATIAL_CLUSTER', 'CRITICAL_CASE', 'STOCKOUT', 'CAMP_NOT_READY', 'SYNC_STALE', 'REFERRAL_DELAY'])
    .optional(),
  acknowledged: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

alertsRouter.get(
  '/',
  requirePermission(PERMISSIONS.ALERT_READ),
  validate(alertQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = parsed(req, alertQuerySchema);
    const items = await listAlerts(req.principal!.scope, {
      eventId: query.eventId,
      severity: query.severity,
      type: query.type,
      acknowledged: query.acknowledged === undefined ? undefined : query.acknowledged === 'true',
      limit: query.limit,
    });
    res.json({ items });
  }),
);

alertsRouter.post(
  '/:id/acknowledge',
  requirePermission(PERMISSIONS.ALERT_ACK),
  asyncHandler(async (req, res) => {
    const alert = await acknowledgeAlert(param(req, 'id'), req.principal!.userId);
    await recordAudit({ action: 'ACKNOWLEDGE_ALERT', entityType: 'Alert', entityId: alert.id, req });
    res.json({ id: alert.id, acknowledgedAt: alert.acknowledgedAt });
  }),
);
