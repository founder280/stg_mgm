import type { ClinicalSubmission, RegistrationInput, SyncOperation, VitalsSubmission, WalkInStage } from '@mgms/shared';
import { STORES, idb } from './idb';

/**
 * The outbox.
 *
 * Every clinical action is written here first and only then attempted over the
 * network — the camp keeps working through an outage, and a record is never
 * lost between the tap and the server acknowledging it.
 */

export type OutboxStatus = 'PENDING' | 'SENDING' | 'SENT' | 'REJECTED';

export interface OutboxEntry {
  clientId: string;
  kind: 'REGISTRATION' | 'VITALS' | 'CLINICAL';
  /** Client id of the registration this belongs to, for the dependent legs. */
  walkInClientId?: string;
  /** Server id, once the registration has been acknowledged. */
  walkInId?: string;
  payload: RegistrationInput | VitalsSubmission | ClinicalSubmission;
  queuedAt: string;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
}

/** The local view of a walk-in, whether or not the server has seen it yet. */
export interface LocalWalkIn {
  clientId: string;
  serverId?: string;
  tokenNumber?: string;
  name: string;
  ageYears: number;
  gender: string;
  stage: WalkInStage;
  triageLevel?: string;
  primarySyndromeCode?: string;
  symptomCodes: string[];
  registeredAt: string;
  registration: RegistrationInput;
  vitals?: VitalsSubmission;
  clinical?: ClinicalSubmission;
  synced: boolean;
}

export async function enqueue(entry: OutboxEntry): Promise<void> {
  await idb.put(STORES.outbox, entry);
}

export async function pendingEntries(): Promise<OutboxEntry[]> {
  const all = await idb.getAll<OutboxEntry>(STORES.outbox);
  return all
    .filter((e) => e.status === 'PENDING' || e.status === 'SENDING')
    // Order matters: a registration must reach the server before the vitals
    // that reference it, and the server resolves that reference by position.
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function allEntries(): Promise<OutboxEntry[]> {
  return idb.getAll<OutboxEntry>(STORES.outbox);
}

export async function markEntry(clientId: string, patch: Partial<OutboxEntry>): Promise<void> {
  const existing = await idb.get<OutboxEntry>(STORES.outbox, clientId);
  if (!existing) return;
  await idb.put(STORES.outbox, { ...existing, ...patch });
}

/** Sent entries are pruned so the outbox does not grow without bound. */
export async function pruneSent(keep = 50): Promise<void> {
  const all = await idb.getAll<OutboxEntry>(STORES.outbox);
  const sent = all.filter((e) => e.status === 'SENT').sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
  for (const entry of sent.slice(keep)) await idb.delete(STORES.outbox, entry.clientId);
}

export async function saveWalkIn(walkIn: LocalWalkIn): Promise<void> {
  await idb.put(STORES.walkIns, walkIn);
}

export async function getWalkIn(clientId: string): Promise<LocalWalkIn | undefined> {
  return idb.get<LocalWalkIn>(STORES.walkIns, clientId);
}

export async function listWalkIns(): Promise<LocalWalkIn[]> {
  const all = await idb.getAll<LocalWalkIn>(STORES.walkIns);
  return all.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
}

export async function updateWalkIn(clientId: string, patch: Partial<LocalWalkIn>): Promise<void> {
  const existing = await getWalkIn(clientId);
  if (!existing) return;
  await saveWalkIn({ ...existing, ...patch });
}

export function toSyncOperation(entry: OutboxEntry): SyncOperation {
  const base = { clientId: entry.clientId, queuedAt: new Date(entry.queuedAt) };
  if (entry.kind === 'REGISTRATION') {
    return { ...base, kind: 'REGISTRATION', payload: entry.payload as RegistrationInput } as SyncOperation;
  }
  return {
    ...base,
    kind: entry.kind,
    walkInId: entry.walkInId,
    walkInClientId: entry.walkInClientId,
    payload: entry.payload,
  } as SyncOperation;
}
