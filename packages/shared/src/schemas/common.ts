import { z } from 'zod';

/**
 * Auto-captured provenance for every submitted record (page 1 of the spec:
 * survey form name/version, login user, device, instance id, timings, IP).
 * The client fills everything except `receivedTime` and `submittedIp`, which
 * the server stamps on arrival so they cannot be spoofed.
 */
export const captureMetaSchema = z.object({
  formName: z.string().min(1).max(120),
  formVersion: z.string().min(1).max(20),
  username: z.string().min(1).max(120),
  loginTime: z.coerce.date(),
  deviceId: z.string().min(1).max(120),
  instanceId: z.string().uuid(),
  recordStartTime: z.coerce.date(),
  recordEndTime: z.coerce.date(),
});

export type CaptureMetaInput = z.infer<typeof captureMetaSchema>;

export const geoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  capturedAt: z.coerce.date().optional(),
});

export type GeoPoint = z.infer<typeof geoPointSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** ISO date-only string, e.g. 2026-01-14. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
