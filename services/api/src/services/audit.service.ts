import type { Request } from 'express';
import { prisma } from '../db.js';
import { logger } from '../logger.js';

export interface AuditInput {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
  req?: Request;
}

/**
 * Append-only audit trail. Failures are logged but never propagate — an audit
 * write must not be able to roll back the clinical action it describes.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? input.req?.principal?.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary,
        before: input.before === undefined ? undefined : (input.before as never),
        after: input.after === undefined ? undefined : (input.after as never),
        ipAddress: input.req?.ip ?? null,
        userAgent: input.req?.headers['user-agent'] ?? null,
      },
    });
  } catch (error) {
    logger.warn({ err: error, action: input.action }, 'Failed to write audit log');
  }
}
