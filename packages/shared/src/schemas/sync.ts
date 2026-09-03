import { z } from 'zod';
import { clinicalSchema, registrationSchema, vitalsSchema } from './walkin.js';

/**
 * Offline sync envelope.
 *
 * A camp device queues operations locally and pushes them in order. Every
 * operation carries the client-generated `instanceId` from the capture
 * metadata, which the server uses as an idempotency key — replaying a batch
 * after a dropped connection can never create duplicate walk-ins.
 */

export const syncOperationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('REGISTRATION'),
    clientId: z.string().uuid(),
    queuedAt: z.coerce.date(),
    payload: registrationSchema,
  }),
  z.object({
    kind: z.literal('VITALS'),
    clientId: z.string().uuid(),
    queuedAt: z.coerce.date(),
    /** Server walk-in id when known, else the registration's clientId. */
    walkInId: z.string().uuid().optional(),
    walkInClientId: z.string().uuid().optional(),
    payload: vitalsSchema,
  }),
  z.object({
    kind: z.literal('CLINICAL'),
    clientId: z.string().uuid(),
    queuedAt: z.coerce.date(),
    walkInId: z.string().uuid().optional(),
    walkInClientId: z.string().uuid().optional(),
    payload: clinicalSchema,
  }),
]);

export type SyncOperation = z.infer<typeof syncOperationSchema>;

export const syncPushSchema = z.object({
  deviceId: z.string().min(1).max(120),
  appVersion: z.string().max(40).optional(),
  operations: z.array(syncOperationSchema).max(200),
});

export type SyncPushInput = z.infer<typeof syncPushSchema>;

export const SYNC_RESULT_STATUSES = ['APPLIED', 'DUPLICATE', 'CONFLICT', 'REJECTED'] as const;
export type SyncResultStatus = (typeof SYNC_RESULT_STATUSES)[number];

export interface SyncOperationResult {
  clientId: string;
  status: SyncResultStatus;
  walkInId?: string;
  tokenNumber?: string;
  message?: string;
}

export interface SyncPushResponse {
  batchId: string;
  receivedAt: string;
  results: SyncOperationResult[];
  applied: number;
  duplicates: number;
  rejected: number;
}

/** Reference data a device pulls to work offline. */
export const syncPullSchema = z.object({
  campId: z.string().uuid(),
  since: z.coerce.date().optional(),
});

export interface SyncBundle {
  generatedAt: string;
  camp: unknown;
  symptoms: unknown[];
  syndromes: unknown[];
  drugs: unknown[];
  inventory: unknown[];
  zones: unknown[];
  /** Hamlet-level geocodes for the offline map interface. */
  addressUnits: unknown[];
  referralFacilities: unknown[];
  waitingList: unknown[];
}
