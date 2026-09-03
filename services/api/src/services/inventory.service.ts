import { projectStock, type StockProjection } from '@mgms/shared';
import { prisma } from '../db.js';
import { ApiError } from '../errors.js';

export interface StockAdjustment {
  campId: string;
  drugId: string;
  /** Signed: negative issues stock, positive receives it. */
  quantity: number;
  type: 'RECEIPT' | 'ISSUE' | 'RETURN' | 'ADJUSTMENT' | 'EXPIRY';
  reference?: string;
  remarks?: string;
  batchNumber?: string;
  userId?: string;
}

export interface StockAdjustmentResult {
  ok: boolean;
  balance: number;
  available: number;
}

/**
 * Move stock and append to the ledger atomically.
 *
 * An issue that would take the balance negative is refused rather than
 * clamped, so the ledger and the shelf never disagree — the caller reports
 * the shortage to the pharmacist instead.
 */
export async function adjustStock(input: StockAdjustment): Promise<StockAdjustmentResult> {
  return prisma.$transaction(async (tx) => {
    const inventory = await tx.campInventory.findUnique({
      where: { campId_drugId: { campId: input.campId, drugId: input.drugId } },
    });

    const available = inventory?.onHand ?? 0;
    const balance = available + input.quantity;

    if (input.quantity < 0 && balance < 0) {
      return { ok: false, balance: available, available };
    }

    if (inventory) {
      await tx.campInventory.update({ where: { id: inventory.id }, data: { onHand: balance } });
    } else {
      await tx.campInventory.create({
        data: {
          campId: input.campId,
          drugId: input.drugId,
          onHand: balance,
          batchNumber: input.batchNumber ?? null,
        },
      });
    }

    await tx.stockTransaction.create({
      data: {
        campId: input.campId,
        drugId: input.drugId,
        type: input.type,
        quantity: input.quantity,
        balanceAfter: balance,
        batchNumber: input.batchNumber ?? null,
        reference: input.reference ?? null,
        remarks: input.remarks ?? null,
        createdById: input.userId ?? null,
      },
    });

    return { ok: true, balance, available };
  });
}

/**
 * Stockout projections for one or more camps, built from the last `days` of
 * issue transactions.
 */
export async function stockProjections(campIds: string[], days = 7): Promise<Array<StockProjection & { campId: string; campName: string }>> {
  if (campIds.length === 0) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const [inventory, issues] = await Promise.all([
    prisma.campInventory.findMany({
      where: { campId: { in: campIds } },
      include: { drug: true, camp: { select: { id: true, name: true } } },
    }),
    prisma.stockTransaction.findMany({
      where: { campId: { in: campIds }, type: 'ISSUE', createdAt: { gte: since } },
      select: { campId: true, drugId: true, quantity: true, createdAt: true },
    }),
  ]);

  // Bucket issues into one series per camp+drug, indexed by day offset.
  const buckets = new Map<string, number[]>();
  for (const issue of issues) {
    const key = `${issue.campId}:${issue.drugId}`;
    const offset = Math.floor((issue.createdAt.getTime() - since.getTime()) / 86_400_000);
    if (offset < 0 || offset >= days) continue;
    const series = buckets.get(key) ?? Array.from({ length: days }, () => 0);
    series[offset] = (series[offset] ?? 0) + Math.abs(issue.quantity);
    buckets.set(key, series);
  }

  return inventory.map((row) => {
    const series = buckets.get(`${row.campId}:${row.drugId}`) ?? Array.from({ length: days }, () => 0);
    const projection = projectStock({
      drugCode: row.drug.code,
      drugName: row.drug.name,
      onHand: row.onHand,
      reorderLevel: row.drug.reorderLevel,
      dailyConsumption: series,
    });
    return { ...projection, campId: row.campId, campName: row.camp.name };
  });
}

export async function assertDrugExists(drugId: string) {
  const drug = await prisma.drug.findUnique({ where: { id: drugId } });
  if (!drug) throw ApiError.notFound('Drug not found');
  return drug;
}
