/**
 * Dump the seeded gathering to a JSON snapshot the browser can load.
 *
 * This is what makes a static, backend-free demonstration possible: GitHub
 * Pages serves files, not a Node process or a database, so the demo build
 * carries its data with it and computes everything else in the browser using
 * the same `@mgms/shared` code the server uses.
 *
 *   npm run demo:snapshot --workspace @mgms/api
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(here, '../../../../packages/demo/src/snapshot.json');

/** Round coordinates — six decimals is well under a metre and halves the file. */
const coord = (value: number | null) => (value == null ? null : Math.round(value * 1e6) / 1e6);

async function main() {
  const event = await prisma.event.findFirst({
    where: { isActive: true },
    orderBy: { startDate: 'desc' },
    include: { districts: { include: { district: { select: { id: true, name: true } } } } },
  });
  if (!event) throw new Error('No active event found — run the seed first');

  const [camps, zones, addressUnits, facilities, symptoms, syndromes, drugs, inventory, roles, users, alerts] =
    await Promise.all([
      prisma.camp.findMany({
        where: { eventId: event.id },
        include: {
          district: { select: { id: true, name: true } },
          zone: { select: { id: true, name: true } },
          incharge: { select: { id: true, fullName: true, mobile: true } },
          readiness: { orderBy: { reportDate: 'desc' }, take: 1, include: { equipment: true, photos: true } },
          _count: { select: { walkIns: true } },
        },
      }),
      prisma.eventZone.findMany({ where: { eventId: event.id } }),
      prisma.addressUnit.findMany({
        select: {
          id: true, code: true, name: true, nameLocal: true, level: true, hierarchy: true,
          parentId: true, latitude: true, longitude: true, population: true,
        },
      }),
      prisma.facility.findMany({ include: { district: { select: { id: true, name: true } } } }),
      prisma.symptom.findMany({ orderBy: { displayOrder: 'asc' } }),
      prisma.syndromeDefinition.findMany({ orderBy: { priority: 'desc' } }),
      prisma.drug.findMany({ orderBy: { name: 'asc' } }),
      prisma.campInventory.findMany({ include: { drug: true } }),
      prisma.role.findMany({ include: { permissions: { include: { permission: true } } } }),
      prisma.user.findMany({
        include: { role: { select: { code: true } }, department: { select: { name: true } }, assignments: true },
      }),
      prisma.alert.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    ]);

  // Walk-ins are the bulk of the file, so only the columns the two apps
  // actually read are carried, and dates are trimmed to the minute.
  const walkIns = await prisma.walkIn.findMany({
    where: { eventId: event.id },
    select: {
      id: true, tokenNumber: true, name: true, ageYears: true, ageBand: true, gender: true,
      residenceType: true, residenceUnitId: true, stayTotalDays: true, onsetPlace: true,
      onsetZoneId: true, campId: true, districtId: true, stage: true, triageLevel: true,
      triageScore: true, primarySyndromeCode: true, registeredAt: true,
      symptoms: { select: { symptomCode: true, onsetTotalHours: true } },
      vitals: { select: { systolic: true, diastolic: true, pulse: true, temperatureF: true, bmi: true } },
    },
    orderBy: { registeredAt: 'asc' },
  });

  const stockIssues = await prisma.stockTransaction.findMany({
    where: { type: 'ISSUE' },
    select: { campId: true, drugId: true, quantity: true, createdAt: true },
  });

  const snapshot = {
    generatedAt: new Date().toISOString(),
    event: {
      id: event.id, code: event.code, name: event.name, description: event.description,
      startDate: event.startDate, endDate: event.endDate, expectedFootfall: event.expectedFootfall,
      stayReferenceDate: event.stayReferenceDate, isActive: event.isActive,
      districts: event.districts.map((d) => d.district),
    },
    camps: camps.map((camp) => ({
      id: camp.id, code: camp.code, name: camp.name, type: camp.type,
      districtId: camp.districtId, district: camp.district, zoneId: camp.zoneId, zone: camp.zone,
      latitude: coord(camp.latitude), longitude: coord(camp.longitude),
      incharge: camp.incharge, isActive: camp.isActive, lastSyncAt: camp.lastSyncAt,
      symptomCodes: camp.symptomCodes, walkInCount: camp._count.walkIns,
      readiness: camp.readiness[0] ?? null,
    })),
    zones: zones.map((z) => ({ ...z, latitude: coord(z.latitude), longitude: coord(z.longitude) })),
    addressUnits: addressUnits.map((u) => ({ ...u, latitude: coord(u.latitude), longitude: coord(u.longitude) })),
    facilities,
    symptoms,
    syndromes,
    drugs,
    inventory: inventory.map((i) => ({
      campId: i.campId, drugId: i.drugId, onHand: i.onHand, batchNumber: i.batchNumber,
      drug: { code: i.drug.code, name: i.drug.name, form: i.drug.form, reorderLevel: i.drug.reorderLevel, emergencyTray: i.drug.emergencyTray, strength: i.drug.strength },
    })),
    stockIssues,
    roles: roles.map((r) => ({
      id: r.id, code: r.code, name: r.name, description: r.description,
      scopeLevel: r.scopeLevel, isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permission.code),
    })),
    users: users.map((u) => ({
      id: u.id, username: u.username, fullName: u.fullName, email: u.email, mobile: u.mobile,
      designation: u.designation, roleCode: u.role.code, department: u.department?.name ?? null,
      isActive: u.isActive, lastLoginAt: u.lastLoginAt,
      assignments: u.assignments.map((a) => ({ scopeType: a.scopeType, scopeId: a.scopeId })),
    })),
    alerts,
    walkIns,
  };

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(snapshot));

  const sizeMb = (Buffer.byteLength(JSON.stringify(snapshot)) / 1_048_576).toFixed(2);
  console.log(`Demo snapshot written to ${outputPath}`);
  console.log(`  ${walkIns.length} walk-ins · ${camps.length} camps · ${users.length} users · ${sizeMb} MB`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
