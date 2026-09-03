import type { SyncBundle, SyncOperationResult, SyncPushInput, SyncPushResponse } from '@mgms/shared';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { recordClinical, recordVitals, registerWalkIn } from './walkin.service.js';

/**
 * Apply a batch of queued offline operations.
 *
 * Operations are applied in the order the device queued them, and a failure on
 * one is recorded against that operation alone — one bad record must never
 * block the rest of a camp's day from reaching the server.
 *
 * Because a device may push a vitals or clinical operation for a walk-in whose
 * registration is in the *same* batch, the server keeps a map from the
 * device's client id to the server id it just created.
 */
export async function processSyncPush(
  input: SyncPushInput,
  context: { userId: string; ipAddress?: string },
): Promise<SyncPushResponse> {
  const results: SyncOperationResult[] = [];
  const clientToServerId = new Map<string, string>();

  let applied = 0;
  let duplicates = 0;
  let rejected = 0;
  let campId: string | null = null;

  for (const operation of input.operations) {
    try {
      if (operation.kind === 'REGISTRATION') {
        campId = operation.payload.campId;
        const result = await registerWalkIn(operation.payload, context);
        clientToServerId.set(operation.clientId, result.walkInId);
        results.push({
          clientId: operation.clientId,
          status: result.duplicate ? 'DUPLICATE' : 'APPLIED',
          walkInId: result.walkInId,
          tokenNumber: result.tokenNumber,
        });
        result.duplicate ? (duplicates += 1) : (applied += 1);
        continue;
      }

      const walkInId =
        operation.walkInId ??
        (operation.walkInClientId ? clientToServerId.get(operation.walkInClientId) : undefined);

      if (!walkInId) {
        results.push({
          clientId: operation.clientId,
          status: 'REJECTED',
          message: 'The walk-in this record belongs to has not reached the server yet',
        });
        rejected += 1;
        continue;
      }

      const result =
        operation.kind === 'VITALS'
          ? await recordVitals(walkInId, operation.payload, context.userId)
          : await recordClinical(walkInId, operation.payload, context.userId);

      results.push({
        clientId: operation.clientId,
        status: result.duplicate ? 'DUPLICATE' : 'APPLIED',
        walkInId,
      });
      result.duplicate ? (duplicates += 1) : (applied += 1);
    } catch (error) {
      logger.warn({ err: error, clientId: operation.clientId }, 'Sync operation rejected');
      results.push({
        clientId: operation.clientId,
        status: 'REJECTED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      rejected += 1;
    }
  }

  const batch = await prisma.syncBatch.create({
    data: {
      campId,
      deviceId: input.deviceId,
      userId: context.userId,
      appVersion: input.appVersion,
      operationCount: input.operations.length,
      applied,
      duplicates,
      rejected,
      ipAddress: context.ipAddress,
    },
  });

  if (campId) {
    await prisma.camp.update({ where: { id: campId }, data: { lastSyncAt: new Date() } });
  }

  return {
    batchId: batch.id,
    receivedAt: batch.receivedAt.toISOString(),
    results,
    applied,
    duplicates,
    rejected,
  };
}

/**
 * Everything a camp device needs to run with no connectivity: the form's
 * masters, this camp's stock, the referral network and the current queue.
 */
export async function buildSyncBundle(campId: string): Promise<SyncBundle> {
  const camp = await prisma.camp.findUnique({
    where: { id: campId },
    include: {
      event: { select: { id: true, name: true, code: true, startDate: true, endDate: true, stayReferenceDate: true } },
      district: { select: { id: true, name: true } },
      zone: { select: { id: true, name: true } },
    },
  });
  if (!camp) throw new Error('Camp not found');

  const symptomFilter = camp.symptomCodes.length > 0 ? { code: { in: camp.symptomCodes } } : {};

  const [symptoms, syndromes, drugs, inventory, zones, addressUnits, referralFacilities, waitingList] =
    await Promise.all([
      prisma.symptom.findMany({ where: { isActive: true, ...symptomFilter }, orderBy: { displayOrder: 'asc' } }),
      prisma.syndromeDefinition.findMany({ where: { isActive: true } }),
      prisma.drug.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      prisma.campInventory.findMany({
        where: { campId },
        select: { drugId: true, onHand: true, batchNumber: true, expiryDate: true, drug: { select: { code: true, name: true, form: true } } },
      }),
      prisma.eventZone.findMany({ where: { eventId: camp.eventId } }),
      // Only the district's own address subtree is shipped, which keeps the
      // offline bundle small enough for a field tablet on a 2G link.
      prisma.addressUnit.findMany({
        where: { OR: [{ id: camp.districtId }, { path: { contains: camp.districtId } }] },
        select: { id: true, code: true, name: true, nameLocal: true, level: true, parentId: true, latitude: true, longitude: true },
      }),
      prisma.facility.findMany({
        where: { isActive: true, OR: [{ isEmpanelled: true }, { type: { in: ['LABORATORY', 'AMBULANCE_BASE'] } }] },
        select: { id: true, code: true, name: true, type: true, specialities: true, latitude: true, longitude: true, contactPhone: true },
      }),
      prisma.walkIn.findMany({
        where: { campId, stage: { in: ['REGISTERED', 'VITALS_DONE'] } },
        orderBy: { registeredAt: 'asc' },
        select: {
          id: true,
          tokenNumber: true,
          name: true,
          ageYears: true,
          gender: true,
          stage: true,
          triageLevel: true,
          primarySyndromeCode: true,
          registeredAt: true,
        },
      }),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    camp,
    symptoms,
    syndromes,
    drugs,
    inventory,
    zones,
    addressUnits,
    referralFacilities,
    waitingList,
  };
}
