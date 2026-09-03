import type { AlertSeverity, AlertType, UserScope } from '@mgms/shared';
import { prisma } from '../db.js';
import { ApiError } from '../errors.js';

export interface UpsertAlertInput {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  body: string;
  /** Stable identity for the condition, so a recurring signal updates in place. */
  dedupeKey: string;
  evidence?: unknown;
  eventId?: string | null;
  campId?: string | null;
  districtId?: string | null;
}

/**
 * Create or refresh an alert.
 *
 * An acknowledged alert whose condition persists is deliberately left
 * acknowledged — re-raising it would make the acknowledge button useless.
 * It is only reopened when the severity increases.
 */
export async function upsertAlert(input: UpsertAlertInput) {
  const existing = await prisma.alert.findUnique({ where: { dedupeKey: input.dedupeKey } });

  const escalated =
    existing?.acknowledgedAt != null && severityRank(input.severity) > severityRank(existing.severity);

  return prisma.alert.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      type: input.type,
      severity: input.severity,
      title: input.title,
      body: input.body,
      dedupeKey: input.dedupeKey,
      evidence: (input.evidence ?? null) as never,
      eventId: input.eventId ?? null,
      campId: input.campId ?? null,
      districtId: input.districtId ?? null,
    },
    update: {
      severity: input.severity,
      title: input.title,
      body: input.body,
      evidence: (input.evidence ?? null) as never,
      ...(escalated ? { acknowledgedAt: null, acknowledgedById: null } : {}),
    },
  });
}

function severityRank(severity: AlertSeverity): number {
  return { INFO: 0, WARNING: 1, CRITICAL: 2 }[severity];
}

/** Raised the moment a walk-in triages RED, so the control room sees it live. */
export async function raiseCriticalCaseAlert(walkInId: string) {
  const walkIn = await prisma.walkIn.findUnique({
    where: { id: walkInId },
    include: { camp: { select: { id: true, name: true } }, district: { select: { id: true, name: true } } },
  });
  if (!walkIn) return null;

  return upsertAlert({
    type: 'CRITICAL_CASE',
    severity: 'CRITICAL',
    title: `Critical case at ${walkIn.camp.name}`,
    body: `Token ${walkIn.tokenNumber} triaged RED (score ${walkIn.triageScore}): ${
      walkIn.triageReasons.join('; ') || 'clinical judgement'
    }. Ambulance and empanelled hospital coordination required.`,
    dedupeKey: `CRITICAL_CASE:${walkInId}`,
    evidence: {
      walkInId,
      tokenNumber: walkIn.tokenNumber,
      triageScore: walkIn.triageScore,
      reasons: walkIn.triageReasons,
      syndrome: walkIn.primarySyndromeCode,
    },
    eventId: walkIn.eventId,
    campId: walkIn.campId,
    districtId: walkIn.districtId,
  });
}

export interface AlertQuery {
  eventId?: string;
  severity?: AlertSeverity;
  type?: AlertType;
  acknowledged?: boolean;
  limit?: number;
}

export async function listAlerts(scope: UserScope, query: AlertQuery = {}) {
  const where: Record<string, unknown> = {};
  if (query.eventId) where.eventId = query.eventId;
  if (query.severity) where.severity = query.severity;
  if (query.type) where.type = query.type;
  if (query.acknowledged === true) where.acknowledgedAt = { not: null };
  if (query.acknowledged === false) where.acknowledgedAt = null;

  // Alerts with no camp or district (state-wide signals) stay visible to
  // everyone; anything geographic is filtered to the user's assignments.
  if (scope.level !== 'STATE') {
    const geo: Array<Record<string, unknown>> = [{ campId: null, districtId: null }];
    if (scope.campIds.length > 0) geo.push({ campId: { in: scope.campIds } });
    if (scope.districtIds.length > 0) geo.push({ districtId: { in: scope.districtIds } });
    where.OR = geo;
  }

  const rows = await prisma.alert.findMany({
    where,
    orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    take: query.limit ?? 100,
    include: {
      camp: { select: { name: true } },
      district: { select: { name: true } },
      acknowledgedBy: { select: { fullName: true } },
    },
  });

  return rows.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    body: a.body,
    evidence: a.evidence,
    campId: a.campId,
    campName: a.camp?.name ?? null,
    districtId: a.districtId,
    districtName: a.district?.name ?? null,
    eventId: a.eventId,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByName: a.acknowledgedBy?.fullName ?? null,
  }));
}

export async function acknowledgeAlert(alertId: string, userId: string) {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw ApiError.notFound('Alert not found');
  if (alert.acknowledgedAt) return alert;

  return prisma.alert.update({
    where: { id: alertId },
    data: { acknowledgedAt: new Date(), acknowledgedById: userId },
  });
}
