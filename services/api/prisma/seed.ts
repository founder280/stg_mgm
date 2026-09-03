/**
 * Development seed.
 *
 * Builds a complete, self-consistent demonstration of a live gathering: the
 * Karthigai Deepam festival at Tiruvannamalai, with three districts, a zoned
 * festival area, eight camps, staff for every role, and ten days of walk-in
 * traffic. A waterborne diarrhoea outbreak is deliberately planted in one
 * sector over the final three days so the aberration detectors, the spatial
 * scan and the stockout projection all have something real to find.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  CAMP_PHOTO_KINDS,
  DRUG_MASTER,
  EQUIPMENT_MASTER,
  FORM_NAME,
  FORM_VERSION,
  ROLE_LIST,
  SYMPTOMS,
  SYNDROMES,
  ageBand,
  ageInMonths,
  classifySyndromes,
  deriveVitals,
  moduleOf,
  scoreTriage,
  unitsRequired,
} from '@mgms/shared';
import { FESTIVAL_ZONES, HEALTH_UNITS, INDIA, type SeedUnit } from './seed-data/geography.js';

const prisma = new PrismaClient();

/** Deterministic PRNG so re-seeding produces the same demonstration data. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
const rand = makeRandom(20260114);

const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;

const FIRST_NAMES = [
  'MURUGAN', 'LAKSHMI', 'ARUN', 'KAVITHA', 'SELVAM', 'PRIYA', 'RAMESH', 'DEEPA',
  'KUMAR', 'MEENA', 'VELU', 'SARANYA', 'ANBU', 'REVATHI', 'GOPAL', 'JANANI',
  'SIVA', 'MALINI', 'RAJA', 'PADMA', 'KARTHIK', 'VIJAYA', 'SURESH', 'BHAVANI',
];
const SURNAMES = ['RAJAN', 'MURTHY', 'PILLAI', 'NADAR', 'GOUNDER', 'IYER', 'DEVI', 'KANNAN', 'SUBRAMANIAN', 'VELAN'];

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  console.log('Seeding MGMS demonstration data...');
  await reset();

  const permissions = await seedPermissions();
  const roles = await seedRoles(permissions);
  const departments = await seedDepartments();
  const addressIndex = await seedAddressTree();
  const facilities = await seedFacilities(addressIndex);
  const drugs = await seedDrugs();
  await seedSymptoms();
  await seedSyndromes();

  const { event, zoneIndex } = await seedEvent(addressIndex);
  const camps = await seedCamps(event.id, zoneIndex, addressIndex, facilities);
  const users = await seedUsers(roles, departments, addressIndex, camps);
  const closingBalances = await seedInventory(camps, drugs);
  await seedRosterAndReadiness(camps, users);
  const consumption = await seedWalkIns(event, camps, zoneIndex, addressIndex, users, drugs);
  await reconcileStockLedger(closingBalances, consumption);

  console.log('\nSeed complete.');
  console.log(`  Districts           : ${[...addressIndex.values()].filter((a) => a.level === 'DISTRICT').length}`);
  console.log(`  Address units       : ${addressIndex.size}`);
  console.log(`  Camps               : ${camps.length}`);
  console.log(`  Users               : ${users.length}`);
  console.log(`  Walk-ins            : ${await prisma.walkIn.count()}`);
  console.log(`\n  Sign in as ${process.env.SEED_ADMIN_USERNAME ?? 'state.admin'} / ${process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe@2026'}`);
}

async function reset() {
  // Ordered by dependency so a re-seed is clean without dropping the schema.
  await prisma.$transaction([
    prisma.alert.deleteMany(),
    prisma.syncBatch.deleteMany(),
    prisma.referral.deleteMany(),
    prisma.prescriptionLine.deleteMany(),
    prisma.labOrder.deleteMany(),
    prisma.clinicalRecord.deleteMany(),
    prisma.vitals.deleteMany(),
    prisma.walkInSyndrome.deleteMany(),
    prisma.biteDetail.deleteMany(),
    prisma.injuryDetail.deleteMany(),
    prisma.walkInSymptom.deleteMany(),
    prisma.walkIn.deleteMany(),
    prisma.stockTransaction.deleteMany(),
    prisma.campInventory.deleteMany(),
    prisma.campPhoto.deleteMany(),
    prisma.readinessEquipment.deleteMany(),
    prisma.campReadiness.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.rosterEntry.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.userAssignment.deleteMany(),
    prisma.camp.deleteMany(),
    prisma.eventZone.deleteMany(),
    prisma.eventDistrict.deleteMany(),
    prisma.event.deleteMany(),
    prisma.user.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.department.deleteMany(),
    prisma.facility.deleteMany(),
    prisma.drug.deleteMany(),
    prisma.symptom.deleteMany(),
    prisma.syndromeDefinition.deleteMany(),
    prisma.addressUnit.deleteMany(),
  ]);
}

async function seedPermissions() {
  await prisma.permission.createMany({
    data: ALL_PERMISSIONS.map((code) => ({
      code,
      module: moduleOf(code),
      description: code,
    })),
  });
  const rows = await prisma.permission.findMany();
  return new Map(rows.map((p) => [p.code, p.id]));
}

async function seedRoles(permissions: Map<string, string>) {
  const roles = new Map<string, string>();
  for (const def of ROLE_LIST) {
    const role = await prisma.role.create({
      data: {
        code: def.code,
        name: def.name,
        description: def.description,
        scopeLevel: def.scopeLevel,
        isSystem: true,
        permissions: {
          create: [...new Set(def.permissions)].map((code) => ({
            permission: { connect: { id: permissions.get(code)! } },
          })),
        },
      },
    });
    roles.set(def.code, role.id);
  }
  return roles;
}

async function seedDepartments() {
  const data = [
    { code: 'HEALTH', name: 'Health and Family Welfare' },
    { code: 'REVENUE', name: 'Revenue and Disaster Management' },
    { code: 'POLICE', name: 'Police' },
    { code: 'FIRE', name: 'Fire and Rescue Services' },
    { code: 'MUNICIPAL', name: 'Municipal Administration and Sanitation' },
  ];
  await prisma.department.createMany({ data });
  const rows = await prisma.department.findMany();
  return new Map(rows.map((d) => [d.code, d.id]));
}

interface AddressRecord {
  id: string;
  code: string;
  name: string;
  level: string;
  latitude: number | null;
  longitude: number | null;
}

async function seedAddressTree() {
  const index = new Map<string, AddressRecord>();

  async function insert(unit: SeedUnit, parent: AddressRecord | null, hierarchy: 'ADMIN' | 'HEALTH', parentPath: string) {
    const row = await prisma.addressUnit.create({
      data: {
        code: unit.code,
        name: unit.name,
        nameLocal: unit.nameLocal,
        level: unit.level as never,
        hierarchy,
        parentId: parent?.id ?? null,
        path: parentPath,
        depth: parentPath ? parentPath.split('/').filter(Boolean).length : 0,
        latitude: unit.latitude ?? null,
        longitude: unit.longitude ?? null,
        population: unit.population ?? null,
      },
    });
    const record: AddressRecord = {
      id: row.id,
      code: row.code,
      name: row.name,
      level: row.level,
      latitude: row.latitude,
      longitude: row.longitude,
    };
    index.set(row.code, record);

    for (const child of unit.children ?? []) {
      await insert(child, record, hierarchy, `${parentPath}${row.id}/`);
    }
    return record;
  }

  await insert(INDIA, null, 'ADMIN', '');

  // The health chain hangs off the same districts.
  const districtForHealth: Record<string, string> = { 'H-TVM-HUD1': 'TN-TVM', 'H-CUD-HUD1': 'TN-CUD' };
  for (const hud of HEALTH_UNITS) {
    const district = index.get(districtForHealth[hud.code]!)!;
    const districtRow = await prisma.addressUnit.findUnique({ where: { id: district.id } });
    await insert(hud, district, 'HEALTH', `${districtRow!.path}${district.id}/`);
  }

  return index;
}

async function seedFacilities(index: Map<string, AddressRecord>) {
  const tvm = index.get('TN-TVM')!;
  const cud = index.get('TN-CUD')!;
  const vlp = index.get('TN-VLP')!;

  const data: Prisma.FacilityCreateManyInput[] = [
    { code: 'GH-TVM', name: 'Government Headquarters Hospital, Tiruvannamalai', type: 'DISTRICT_HOSPITAL', districtId: tvm.id, latitude: 12.2289, longitude: 79.0712, specialities: ['GENERAL_MEDICINE', 'GENERAL_SURGERY', 'ORTHOPAEDICS', 'PAEDIATRICS', 'OBSTETRICS', 'TRAUMA'], bedCapacity: 500, isEmpanelled: true, contactName: 'Dean, GH Tiruvannamalai', contactPhone: '+914175222333' },
    { code: 'MCH-VLP', name: 'Government Medical College Hospital, Villupuram', type: 'MEDICAL_COLLEGE', districtId: vlp.id, latitude: 11.9385, longitude: 79.4934, specialities: ['GENERAL_MEDICINE', 'CARDIOLOGY', 'NEUROLOGY', 'TRAUMA', 'BURNS', 'TOXICOLOGY'], bedCapacity: 850, isEmpanelled: true, contactPhone: '+914146222444' },
    { code: 'EMP-ARUNA', name: 'Arunachala Multispeciality Hospital', type: 'EMPANELLED_HOSPITAL', districtId: tvm.id, latitude: 12.2198, longitude: 79.0803, specialities: ['GENERAL_MEDICINE', 'ORTHOPAEDICS', 'GENERAL_SURGERY'], bedCapacity: 120, isEmpanelled: true, contactPhone: '+914175233444' },
    { code: 'EMP-SRIRAM', name: 'Sriram Trauma Centre', type: 'EMPANELLED_HOSPITAL', districtId: tvm.id, latitude: 12.2402, longitude: 79.0891, specialities: ['TRAUMA', 'ORTHOPAEDICS'], bedCapacity: 60, isEmpanelled: true, contactPhone: '+914175244555' },
    { code: 'PHC-ADI', name: 'PHC Adiannamalai', type: 'PHC', districtId: tvm.id, latitude: 12.2361, longitude: 79.0578, specialities: ['GENERAL_MEDICINE'], bedCapacity: 6 },
    { code: 'PHC-KOZHAI', name: 'PHC Kozhai', type: 'PHC', districtId: cud.id, latitude: 11.4712, longitude: 79.5621, specialities: ['GENERAL_MEDICINE'], bedCapacity: 6 },
    { code: 'LAB-TVM', name: 'District Public Health Laboratory, Tiruvannamalai', type: 'LABORATORY', districtId: tvm.id, latitude: 12.2271, longitude: 79.0729, contactPhone: '+914175255666' },
    { code: 'LAB-KING', name: 'King Institute of Preventive Medicine, Guindy', type: 'LABORATORY', districtId: tvm.id, latitude: 13.0067, longitude: 80.2206, contactPhone: '+914422501520' },
    { code: 'WH-TVM', name: 'TNMSC Drug Warehouse, Tiruvannamalai', type: 'DRUG_WAREHOUSE', districtId: tvm.id, latitude: 12.2183, longitude: 79.0669 },
    { code: 'AMB-108-TVM', name: '108 Ambulance Base, Tiruvannamalai', type: 'AMBULANCE_BASE', districtId: tvm.id, latitude: 12.2265, longitude: 79.0756, contactPhone: '108' },
    { code: 'CR-TVM', name: 'Festival Control Room, Tiruvannamalai', type: 'CONTROL_ROOM', districtId: tvm.id, latitude: 12.2312, longitude: 79.0672 },
  ];

  await prisma.facility.createMany({ data });
  const rows = await prisma.facility.findMany();
  return new Map(rows.map((f) => [f.code, f]));
}

async function seedDrugs() {
  await prisma.drug.createMany({
    data: DRUG_MASTER.map((d) => ({
      code: d.code,
      name: d.name,
      genericName: d.genericName,
      form: d.form as never,
      strength: d.strength,
      emergencyTray: d.emergencyTray,
      reorderLevel: d.reorderLevel,
    })),
  });
  const rows = await prisma.drug.findMany();
  return new Map(rows.map((d) => [d.code, d]));
}

async function seedSymptoms() {
  await prisma.symptom.createMany({
    data: SYMPTOMS.map((s) => ({
      code: s.code,
      name: s.name,
      nameLocal: s.nameLocal,
      group: s.group,
      subFormat: s.subFormat,
      redFlag: s.redFlag ?? false,
      displayOrder: s.displayOrder,
    })),
  });
  const rows = await prisma.symptom.findMany();
  return new Map(rows.map((s) => [s.code, s.id]));
}

async function seedSyndromes() {
  for (const s of SYNDROMES) {
    await prisma.syndromeDefinition.create({
      data: {
        code: s.code,
        name: s.name,
        caseDefinition: s.caseDefinition,
        reference: s.reference,
        priority: s.priority,
        notifiable: s.notifiable,
        rule: s.rule as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

async function seedEvent(index: Map<string, AddressRecord>) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 9);
  const end = new Date(today);
  end.setDate(end.getDate() + 4);

  const event = await prisma.event.create({
    data: {
      code: 'KD-TVM-2026',
      name: 'Karthigai Deepam Festival, Tiruvannamalai',
      description:
        'Annual mass gathering around the Arunachaleswarar temple and the 14 km Girivalam path. Peak single-day footfall exceeds two million pilgrims.',
      startDate: start,
      endDate: end,
      expectedFootfall: 3000000,
      stayReferenceDate: start,
      districts: {
        create: [
          { district: { connect: { id: index.get('TN-TVM')!.id } } },
          { district: { connect: { id: index.get('TN-CUD')!.id } } },
          { district: { connect: { id: index.get('TN-VLP')!.id } } },
        ],
      },
    },
  });

  const zoneIndex = new Map<string, { id: string; name: string; latitude: number | null; longitude: number | null; expectedFootfall: number | null }>();
  for (const parent of FESTIVAL_ZONES) {
    const parentRow = await prisma.eventZone.create({
      data: {
        eventId: event.id,
        code: parent.code,
        name: parent.name,
        latitude: parent.latitude,
        longitude: parent.longitude,
        expectedFootfall: parent.expectedFootfall,
      },
    });
    zoneIndex.set(parent.code, parentRow);
    for (const child of parent.children) {
      const childRow = await prisma.eventZone.create({
        data: {
          eventId: event.id,
          code: child.code,
          name: child.name,
          parentId: parentRow.id,
          latitude: child.latitude,
          longitude: child.longitude,
          expectedFootfall: child.expectedFootfall,
        },
      });
      zoneIndex.set(child.code, childRow);
    }
  }

  return { event, zoneIndex };
}

const CAMP_PLAN = [
  { code: 'C-GIRI-N1', name: 'Girivalam North Medical Camp', zone: 'Z-GIRI-N', district: 'TN-TVM', lat: 12.2455, lon: 79.0681, type: 'MEDICAL_CAMP' },
  { code: 'C-GIRI-N2', name: 'Adiannamalai First Aid Post', zone: 'Z-GIRI-N', district: 'TN-TVM', lat: 12.2398, lon: 79.0602, type: 'FIRST_AID_POST' },
  { code: 'C-GIRI-E1', name: 'Girivalam East Medical Camp', zone: 'Z-GIRI-E', district: 'TN-TVM', lat: 12.2281, lon: 79.0955, type: 'MEDICAL_CAMP' },
  { code: 'C-GIRI-S1', name: 'Girivalam South Medical Camp', zone: 'Z-GIRI-S', district: 'TN-TVM', lat: 12.2049, lon: 79.0718, type: 'MEDICAL_CAMP' },
  { code: 'C-GIRI-W1', name: 'Girivalam West First Aid Post', zone: 'Z-GIRI-W', district: 'TN-TVM', lat: 12.2291, lon: 79.0519, type: 'FIRST_AID_POST' },
  { code: 'C-TEMPLE-Q1', name: 'Darshan Queue Medical Camp', zone: 'Z-TEMPLE-Q', district: 'TN-TVM', lat: 12.2321, lon: 79.0661, type: 'MEDICAL_CAMP' },
  { code: 'C-TEMPLE-M1', name: 'Mada Street Mobile Unit', zone: 'Z-TEMPLE-M', district: 'TN-TVM', lat: 12.2304, lon: 79.0691, type: 'MOBILE_UNIT' },
  { code: 'C-TRANSIT-B1', name: 'Bus Stand Medical Camp', zone: 'Z-TRANSIT-BUS', district: 'TN-TVM', lat: 12.2121, lon: 79.0838, type: 'MEDICAL_CAMP' },
];

async function seedCamps(
  eventId: string,
  zoneIndex: Map<string, { id: string }>,
  addressIndex: Map<string, AddressRecord>,
  facilities: Map<string, { id: string }>,
) {
  const symptomCodes = SYMPTOMS.map((s) => s.code);
  const camps = [];
  for (const plan of CAMP_PLAN) {
    const camp = await prisma.camp.create({
      data: {
        eventId,
        code: plan.code,
        name: plan.name,
        type: plan.type as never,
        zoneId: zoneIndex.get(plan.zone)!.id,
        districtId: addressIndex.get(plan.district)!.id,
        facilityId: plan.code === 'C-GIRI-N2' ? facilities.get('PHC-ADI')!.id : null,
        latitude: plan.lat,
        longitude: plan.lon,
        symptomCodes,
        opensAt: new Date(new Date().setHours(6, 0, 0, 0)),
        closesAt: new Date(new Date().setHours(23, 0, 0, 0)),
        lastSyncAt: new Date(Date.now() - randInt(1, 25) * 60_000),
      },
    });
    camps.push(camp);
  }
  return camps;
}

const USER_PLAN = [
  { username: 'state.admin', fullName: 'Dr. A. Rajeshwari', role: 'STATE_SUPER_ADMIN', designation: 'Director of Public Health', dept: 'HEALTH', scope: null },
  { username: 'state.officer', fullName: 'Dr. S. Venkatesan', role: 'STATE_OFFICER', designation: 'Joint Director (Communicable Diseases)', dept: 'HEALTH', scope: null },
  { username: 'region.north', fullName: 'Dr. K. Meenakshi', role: 'REGIONAL_USER', designation: 'Regional Deputy Director', dept: 'HEALTH', scope: { type: 'REGION', code: 'TN-RGN-N' } },
  { username: 'dept.health.head', fullName: 'Dr. M. Anbarasan', role: 'DEPARTMENT_HEAD', designation: 'Head, Health Department', dept: 'HEALTH', scope: null },
  { username: 'dept.idsp', fullName: 'Dr. P. Nithya', role: 'DEPARTMENT_DOMAIN_USER', designation: 'State IDSP Surveillance Officer', dept: 'HEALTH', scope: null },
  { username: 'dept.revenue.head', fullName: 'Thiru R. Chandrasekar', role: 'DEPARTMENT_HEAD', designation: 'Head, Revenue Department', dept: 'REVENUE', scope: null },
  { username: 'district.tvm', fullName: 'Dr. V. Kalaiselvi', role: 'DISTRICT_USER', designation: 'Deputy Director of Health Services', dept: 'HEALTH', scope: { type: 'DISTRICT', code: 'TN-TVM' } },
  { username: 'district.cud', fullName: 'Dr. T. Saravanan', role: 'DISTRICT_USER', designation: 'Deputy Director of Health Services', dept: 'HEALTH', scope: { type: 'DISTRICT', code: 'TN-CUD' } },
  { username: 'district.tvm.idsp', fullName: 'Dr. G. Bhuvaneswari', role: 'DISTRICT_DOMAIN_USER', designation: 'District Surveillance Officer, DSU-IDSP', dept: 'HEALTH', scope: { type: 'DISTRICT', code: 'TN-TVM' } },
  { username: 'district.tvm.drugs', fullName: 'Thiru N. Elangovan', role: 'DISTRICT_DOMAIN_USER', designation: 'District Drug Store In-charge', dept: 'HEALTH', scope: { type: 'DISTRICT', code: 'TN-TVM' } },
];

async function seedUsers(
  roles: Map<string, string>,
  departments: Map<string, string>,
  addressIndex: Map<string, AddressRecord>,
  camps: Array<{ id: string; code: string; name: string }>,
) {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe@2026';
  const hash = await argon2.hash(adminPassword, { type: argon2.argon2id });

  const created: Array<{ id: string; username: string; roleCode: string; campId?: string }> = [];

  for (const plan of USER_PLAN) {
    const user = await prisma.user.create({
      data: {
        username: plan.username,
        fullName: plan.fullName,
        email: `${plan.username}@tn.gov.in`,
        mobile: `+91${randInt(6000000000, 9999999999)}`,
        passwordHash: hash,
        designation: plan.designation,
        roleId: roles.get(plan.role)!,
        departmentId: departments.get(plan.dept)!,
        assignments: plan.scope
          ? { create: [{ scopeType: plan.scope.type as never, scopeId: addressIndex.get(plan.scope.code)!.id }] }
          : undefined,
      },
    });
    created.push({ id: user.id, username: user.username, roleCode: plan.role });
  }

  // Camp staff: a supervisor, a medical officer, a paramedic and two
  // volunteers per camp — the roles the split data-entry workflow needs.
  const staffTemplates = [
    { suffix: 'sup', role: 'SUPERVISOR', title: 'Camp Supervisor' },
    { suffix: 'mo', role: 'FIELD_STAFF', title: 'Medical Officer' },
    { suffix: 'para', role: 'FIELD_STAFF', title: 'Paramedic' },
    { suffix: 'vol1', role: 'VOLUNTEER', title: 'Volunteer' },
    { suffix: 'vol2', role: 'VOLUNTEER', title: 'Volunteer' },
  ];

  for (const camp of camps) {
    const slug = camp.code.toLowerCase().replace(/^c-/, '').replace(/-/g, '');
    for (const template of staffTemplates) {
      const user = await prisma.user.create({
        data: {
          username: `${slug}.${template.suffix}`,
          fullName: `${pick(FIRST_NAMES)} ${pick(SURNAMES)}`.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()),
          passwordHash: hash,
          designation: `${template.title}, ${camp.name}`,
          roleId: roles.get(template.role)!,
          departmentId: departments.get('HEALTH')!,
          assignments: { create: [{ scopeType: 'CAMP', scopeId: camp.id }] },
        },
      });
      created.push({ id: user.id, username: user.username, roleCode: template.role, campId: camp.id });
    }
    const supervisor = created.find((u) => u.campId === camp.id && u.roleCode === 'SUPERVISOR');
    if (supervisor) {
      await prisma.camp.update({ where: { id: camp.id }, data: { inchargeUserId: supervisor.id } });
    }
  }

  return created;
}

/**
 * Create the inventory rows and decide each camp's *closing* balance.
 *
 * The opening receipt cannot be written yet: it has to equal the closing
 * balance plus everything the camp will go on to dispense, otherwise the stock
 * ledger and the shelf disagree. It is written by `reconcileStockLedger` once
 * the walk-ins — and therefore the consumption — are known.
 */
async function seedInventory(
  camps: Array<{ id: string; code: string }>,
  drugs: Map<string, { id: string; reorderLevel: number }>,
): Promise<Map<string, number>> {
  const closingBalances = new Map<string, number>();

  for (const camp of camps) {
    for (const drug of DRUG_MASTER) {
      const drugRow = drugs.get(drug.code)!;
      // The camp at the centre of the planted outbreak ends nearly out of ORS.
      const closing =
        camp.code === 'C-GIRI-N1' && drug.code === 'ORS' ? 35 : drug.reorderLevel * randInt(2, 5);

      closingBalances.set(`${camp.id}:${drugRow.id}`, closing);
      await prisma.campInventory.create({
        data: { campId: camp.id, drugId: drugRow.id, onHand: closing, batchNumber: `B${randInt(1000, 9999)}` },
      });
    }
  }

  return closingBalances;
}

/**
 * Write the stock ledger so that opening receipt minus daily issues equals the
 * balance on the shelf, and the issues are spread over the days they actually
 * happened — which is what the stockout forecast reads.
 */
async function reconcileStockLedger(
  closingBalances: Map<string, number>,
  consumption: Map<string, number>,
) {
  // key -> day -> units issued
  const byCampDrug = new Map<string, Map<string, number>>();
  for (const [key, units] of consumption) {
    const [campId, drugId, day] = key.split(':') as [string, string, string];
    const inner = byCampDrug.get(`${campId}:${drugId}`) ?? new Map<string, number>();
    inner.set(day, (inner.get(day) ?? 0) + units);
    byCampDrug.set(`${campId}:${drugId}`, inner);
  }

  for (const [key, closing] of closingBalances) {
    const [campId, drugId] = key.split(':') as [string, string];
    const days = byCampDrug.get(key);
    const issued = days ? [...days.values()].reduce((a, b) => a + b, 0) : 0;
    const opening = closing + issued;

    let balance = opening;
    await prisma.stockTransaction.create({
      data: {
        campId,
        drugId,
        type: 'RECEIPT',
        quantity: opening,
        balanceAfter: balance,
        reference: 'Opening stock from TNMSC warehouse',
        createdAt: new Date(Date.now() - 10 * 86_400_000),
      },
    });

    for (const day of [...(days?.keys() ?? [])].sort()) {
      const units = days!.get(day)!;
      balance -= units;
      await prisma.stockTransaction.create({
        data: {
          campId,
          drugId,
          type: 'ISSUE',
          quantity: -units,
          balanceAfter: balance,
          reference: 'Camp dispensing',
          // Dated to the day of issue so the burn-rate forecast is meaningful.
          createdAt: new Date(`${day}T18:00:00.000Z`),
        },
      });
    }

    await prisma.campInventory.update({
      where: { campId_drugId: { campId, drugId } },
      data: { onHand: balance },
    });
  }
}

async function seedRosterAndReadiness(
  camps: Array<{ id: string; code: string }>,
  users: Array<{ id: string; roleCode: string; campId?: string }>,
) {
  const today = new Date();

  for (const camp of camps) {
    const staff = users.filter((u) => u.campId === camp.id);

    for (let offset = 0; offset < 3; offset += 1) {
      const dutyDate = new Date(today);
      dutyDate.setDate(dutyDate.getDate() - offset);
      const dateOnly = new Date(dayKey(dutyDate));

      for (const shift of ['MORNING', 'EVENING'] as const) {
        for (const member of staff) {
          const entry = await prisma.rosterEntry.create({
            data: { campId: camp.id, userId: member.id, dutyDate: dateOnly, shift, role: member.roleCode },
          });
          // Yesterday and before are already marked; today's evening shift is not.
          if (offset > 0 || shift === 'MORNING') {
            await prisma.attendance.create({
              data: {
                rosterEntryId: entry.id,
                status: chance(0.92) ? 'PRESENT' : chance(0.5) ? 'LATE' : 'ABSENT',
                markedById: staff.find((s) => s.roleCode === 'SUPERVISOR')?.id ?? null,
              },
            });
          }
        }
      }
    }

    // Pre-camp readiness for today.
    const equipment = EQUIPMENT_MASTER.map((e) => ({
      equipmentCode: e.code,
      // One camp deliberately has a non-functional oxygen cylinder.
      status:
        camp.code === 'C-GIRI-W1' && e.code === 'OXYGEN_CYLINDER'
          ? ('NOT_FUNCTIONAL' as const)
          : chance(0.94)
            ? ('FUNCTIONAL' as const)
            : ('NOT_AVAILABLE' as const),
      quantity: randInt(1, 4),
    }));

    const functional = equipment.filter((e) => e.status === 'FUNCTIONAL').length;
    const readinessPercent = Math.round((functional / equipment.length) * 100);

    await prisma.campReadiness.create({
      data: {
        campId: camp.id,
        reportDate: new Date(dayKey(today)),
        venueReady: true,
        waterAvailable: true,
        powerAvailable: camp.code !== 'C-GIRI-W1',
        wasteDisposalReady: true,
        feedback: 'Crowd density high during the evening girivalam. Additional ORS counters requested.',
        readinessPercent,
        equipment: { create: equipment },
        photos: {
          create: CAMP_PHOTO_KINDS.filter((p) => p.required).map((p) => ({
            kind: p.code,
            url: `https://storage.mgms.tn.gov.in/camps/${camp.code}/${p.code.toLowerCase()}.jpg`,
            capturedAt: new Date(),
          })),
        },
      },
    });
  }
}

/** Symptom profiles with the rough mix a real camp sees. */
const PRESENTATION_MIX = [
  { weight: 22, symptoms: ['FEVER'], categories: ['MEDICAL'] },
  { weight: 14, symptoms: ['FEVER', 'COUGH'], categories: ['MEDICAL'] },
  { weight: 12, symptoms: ['HEADACHE'], categories: ['MEDICAL'] },
  { weight: 10, symptoms: ['JOINT_PAIN'], categories: ['MEDICAL'] },
  { weight: 10, symptoms: ['DEHYDRATION', 'GIDDINESS'], categories: ['MEDICAL'] },
  { weight: 8, symptoms: ['INJURY'], categories: ['SURGICAL'] },
  { weight: 6, symptoms: ['DIARRHOEA'], categories: ['MEDICAL'] },
  { weight: 5, symptoms: ['ABDOMINAL_PAIN', 'VOMITING'], categories: ['MEDICAL'] },
  { weight: 4, symptoms: ['COUGH'], categories: ['MEDICAL'] },
  { weight: 3, symptoms: ['FEVER', 'RASH'], categories: ['MEDICAL'] },
  { weight: 2, symptoms: ['FEVER', 'COUGH', 'SOB'], categories: ['CRITICALLY_ILL', 'MEDICAL'] },
  { weight: 2, symptoms: ['BITE'], categories: ['MEDICAL'] },
  { weight: 1, symptoms: ['JAUNDICE'], categories: ['MEDICAL'] },
  { weight: 1, symptoms: ['FEVER', 'GUM_BLEED'], categories: ['CRITICALLY_ILL', 'MEDICAL'] },
];

const TOTAL_WEIGHT = PRESENTATION_MIX.reduce((a, p) => a + p.weight, 0);

function samplePresentation() {
  let roll = rand() * TOTAL_WEIGHT;
  for (const entry of PRESENTATION_MIX) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return PRESENTATION_MIX[0]!;
}

async function seedWalkIns(
  event: { id: string; startDate: Date },
  camps: Array<{ id: string; code: string; districtId: string; zoneId: string | null; latitude: number | null; longitude: number | null }>,
  zoneIndex: Map<string, { id: string }>,
  addressIndex: Map<string, AddressRecord>,
  users: Array<{ id: string; roleCode: string; campId?: string }>,
  drugs: Map<string, { id: string; code: string; name: string; form: string }>,
) {
  const symptomRows = await prisma.symptom.findMany();
  const symptomIds = new Map(symptomRows.map((s) => [s.code, s.id]));
  const syndromeRows = await prisma.syndromeDefinition.findMany();
  const syndromeIds = new Map(syndromeRows.map((s) => [s.code, s.id]));

  const hamlets = [...addressIndex.values()].filter((a) => a.level === 'HAMLET');
  const labFacility = await prisma.facility.findUnique({ where: { code: 'LAB-TVM' } });
  const referralFacilities = await prisma.facility.findMany({ where: { isEmpanelled: true } });

  const today = new Date();
  const tokenCounters = new Map<string, number>();
  // `${campId}:${drugId}:${YYYY-MM-DD}` -> units issued that day
  const consumption = new Map<string, number>();

  for (let dayOffset = 9; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - dayOffset);
    // Footfall ramps towards the deepam day.
    const dayFactor = 0.5 + (9 - dayOffset) * 0.12;

    for (const camp of camps) {
      const baseVolume = camp.code.includes('TEMPLE') ? 26 : camp.code.includes('FIRST_AID') ? 10 : 18;
      let volume = Math.round(baseVolume * dayFactor * (0.8 + rand() * 0.4));

      // Planted outbreak: a contaminated water point in the Girivalam North
      // sector drives extra diarrhoea cases over the last three days.
      const outbreakCamp = camp.code === 'C-GIRI-N1';
      const outbreakDay = dayOffset <= 2;
      const extraDiarrhoea = outbreakCamp && outbreakDay ? [14, 22, 28][2 - dayOffset]! : 0;
      volume += extraDiarrhoea;

      for (let i = 0; i < volume; i += 1) {
        const isOutbreakCase = extraDiarrhoea > 0 && i < extraDiarrhoea;
        const presentation = isOutbreakCase
          ? { symptoms: ['DIARRHOEA', 'VOMITING', 'DEHYDRATION'], categories: ['MEDICAL'] }
          : samplePresentation();

        await createWalkIn({
          event,
          camp,
          day,
          presentation,
          symptomIds,
          syndromeIds,
          hamlets,
          zoneIndex,
          users,
          drugs,
          labFacility,
          referralFacilities,
          tokenCounters,
          consumption,
          isToday: dayOffset === 0,
        });
      }
    }
  }

  return consumption;
}

interface CreateWalkInArgs {
  event: { id: string; startDate: Date };
  camp: { id: string; code: string; districtId: string; zoneId: string | null; latitude: number | null; longitude: number | null };
  day: Date;
  presentation: { symptoms: string[]; categories: string[] };
  symptomIds: Map<string, string>;
  syndromeIds: Map<string, string>;
  hamlets: AddressRecord[];
  zoneIndex: Map<string, { id: string }>;
  users: Array<{ id: string; roleCode: string; campId?: string }>;
  drugs: Map<string, { id: string; code: string; name: string; form: string }>;
  labFacility: { id: string } | null;
  referralFacilities: Array<{ id: string; specialities: string[] }>;
  tokenCounters: Map<string, number>;
  consumption: Map<string, number>;
  isToday: boolean;
}

async function createWalkIn(args: CreateWalkInArgs) {
  const { camp, day, presentation, symptomIds, syndromeIds, hamlets, users, drugs, consumption } = args;

  const staff = users.filter((u) => u.campId === camp.id);
  const volunteer = staff.find((s) => s.roleCode === 'VOLUNTEER') ?? staff[0]!;
  const medicalOfficer = staff.find((s) => s.roleCode === 'FIELD_STAFF') ?? staff[0]!;

  const tokenKey = `${camp.id}:${dayKey(day)}`;
  const seq = (args.tokenCounters.get(tokenKey) ?? 0) + 1;
  args.tokenCounters.set(tokenKey, seq);

  const registeredAt = new Date(day);
  registeredAt.setHours(randInt(6, 22), randInt(0, 59), randInt(0, 59), 0);

  const ageYears = chance(0.08) ? randInt(0, 5) : chance(0.15) ? randInt(60, 88) : randInt(6, 59);
  const totalMonths = ageInMonths(ageYears, ageYears === 0 ? randInt(0, 11) : 0, 0);

  const symptomEntries = presentation.symptoms.map((code) => ({
    code,
    onsetDays: code === 'FEVER' && chance(0.15) ? randInt(8, 14) : randInt(1, 3),
    onsetHours: randInt(0, 12),
  }));

  const hasInjury = presentation.symptoms.includes('INJURY');
  const biteTypes = presentation.symptoms.includes('BITE')
    ? [pick(['INSECT', 'INSECT', 'SNAKE', 'SCORPION', 'UNKNOWN'] as const)]
    : [];

  // Vitals are recorded for most, but not all, walk-ins.
  const hasVitals = chance(0.75);
  const vitals = hasVitals
    ? {
        weightKg: Math.round((ageYears < 12 ? randInt(8, 40) : randInt(42, 92)) * 10) / 10,
        heightCm: ageYears < 12 ? randInt(70, 150) : randInt(145, 182),
        systolic: chance(0.12) ? randInt(140, 175) : randInt(104, 132),
        diastolic: chance(0.12) ? randInt(92, 104) : randInt(66, 86),
        pulse: presentation.symptoms.includes('DEHYDRATION') ? randInt(96, 128) : randInt(64, 96),
        temperatureF: presentation.symptoms.includes('FEVER')
          ? Math.round((100.4 + rand() * 3.4) * 10) / 10
          : Math.round((97.6 + rand() * 1.6) * 10) / 10,
      }
    : {};

  const derived = deriveVitals(vitals);

  const syndromeInput = {
    symptoms: Object.fromEntries(symptomEntries.map((s) => [s.code, s.onsetDays * 24 + s.onsetHours])),
    biteTypes,
    hasInjury,
    temperatureF: vitals.temperatureF ?? null,
    pulse: vitals.pulse ?? null,
    ageMonths: totalMonths,
  };
  const syndromes = classifySyndromes(syndromeInput);

  const triage = scoreTriage({
    ...vitals,
    symptomCodes: presentation.symptoms,
    biteTypes,
    caseCategories: presentation.categories as never,
    ageMonths: totalMonths,
  });

  const needsReferral = triage.level === 'RED' || (triage.level === 'ORANGE' && chance(0.35));
  const hamlet = pick(hamlets);
  const residenceType = chance(0.82) ? 'HOME_STATE' : chance(0.8) ? 'OTHER_STATE' : 'FOREIGNER';

  // The last few of today's walk-ins are still moving through the workflow,
  // so the waiting list on the dashboard is never artificially empty.
  const stage = args.isToday && chance(0.12)
    ? pick(['REGISTERED', 'REGISTERED', 'VITALS_DONE'] as const)
    : needsReferral
      ? ('REFERRED' as const)
      : ('DISPENSED' as const);

  const stayDays = randInt(0, 6);
  const instanceId = randomUUID();
  const recordStart = new Date(registeredAt.getTime() - randInt(120, 420) * 1000);

  const walkIn = await prisma.walkIn.create({
    data: {
      instanceId,
      tokenNumber: `${camp.code}-${dayKey(day).replace(/-/g, '')}-${String(seq).padStart(4, '0')}`,
      campId: camp.id,
      eventId: args.event.id,
      districtId: camp.districtId,
      name: `${pick(FIRST_NAMES)} ${pick(SURNAMES)}`,
      ageYears,
      ageMonths: 0,
      ageDays: 0,
      ageTotalMonths: totalMonths,
      ageBand: ageBand(totalMonths),
      gender: chance(0.49) ? 'MALE' : chance(0.96) ? 'FEMALE' : 'TRANSGENDER',
      residenceType: residenceType as never,
      residenceUnitId: residenceType === 'HOME_STATE' ? hamlet.id : null,
      residenceText: residenceType === 'HOME_STATE' ? null : residenceType === 'OTHER_STATE' ? 'Andhra Pradesh' : 'Sri Lanka',
      countryCode: residenceType === 'FOREIGNER' ? 'LK' : 'IN',
      daysAtResidence: randInt(30, 3650),
      mobile: chance(0.85) ? `+91${randInt(6000000000, 9999999999)}` : null,
      stayDays,
      stayTotalDays: stayDays,
      caseCategories: presentation.categories,
      onsetPlace: chance(0.62) ? 'FESTIVAL_AREA' : chance(0.6) ? 'ENROUTE' : 'HOME',
      onsetZoneId: camp.zoneId,
      latitude: camp.latitude ? camp.latitude + (rand() - 0.5) * 0.004 : null,
      longitude: camp.longitude ? camp.longitude + (rand() - 0.5) * 0.004 : null,
      locationAccuracyM: randInt(4, 18),
      stage,
      triageLevel: triage.level,
      triageScore: triage.score,
      triageReasons: triage.reasons,
      primarySyndromeCode: syndromes[0]?.code ?? null,
      registeredById: volunteer.id,
      registeredAt,
      closedAt: stage === 'DISPENSED' ? new Date(registeredAt.getTime() + randInt(10, 55) * 60_000) : null,
      formName: FORM_NAME,
      formVersion: FORM_VERSION,
      deviceId: `TAB-${camp.code}-${randInt(1, 3)}`,
      captureUsername: volunteer.id,
      loginTime: new Date(registeredAt.getTime() - randInt(1, 6) * 3600_000),
      recordStartTime: recordStart,
      recordEndTime: registeredAt,
      submittedIp: `10.20.${randInt(1, 40)}.${randInt(2, 250)}`,
      symptoms: {
        create: symptomEntries
          .filter((s) => symptomIds.has(s.code))
          .map((s) => ({
            symptomId: symptomIds.get(s.code)!,
            symptomCode: s.code,
            onsetDays: s.onsetDays,
            onsetHours: s.onsetHours,
            onsetTotalHours: s.onsetDays * 24 + s.onsetHours,
          })),
      },
      injuries: hasInjury
        ? { create: [{ injuryType: pick(['ABRASION', 'LACERATION', 'FRACTURE'] as const), bodySite: pick(['Right knee', 'Left forearm', 'Scalp', 'Right ankle']), lengthCm: randInt(1, 9) }] }
        : undefined,
      bites: biteTypes.length > 0 ? { create: biteTypes.map((b) => ({ biteType: b as never, bodySite: 'Right foot' })) } : undefined,
      syndromes: {
        create: syndromes
          .filter((s) => syndromeIds.has(s.code))
          .map((s, idx) => ({
            syndromeId: syndromeIds.get(s.code)!,
            syndromeCode: s.code,
            isPrimary: idx === 0,
            reference: s.reference,
          })),
      },
    },
  });

  if (hasVitals) {
    await prisma.vitals.create({
      data: {
        walkInId: walkIn.id,
        ...vitals,
        bmi: derived.bmi,
        bmiCategory: derived.bmiCategory,
        bpStage: derived.bpStage,
        newlyDetectedHypertension: derived.newlyDetectedHypertension,
        recordedById: medicalOfficer.id,
        recordedAt: new Date(registeredAt.getTime() + randInt(3, 15) * 60_000),
        instanceId: randomUUID(),
        deviceId: `TAB-${camp.code}-${randInt(1, 3)}`,
      },
    });
  }

  if (stage === 'DISPENSED' || stage === 'REFERRED') {
    await prisma.clinicalRecord.create({
      data: {
        walkInId: walkIn.id,
        provisionalDiagnosis: syndromes[0]?.name ?? 'Symptomatic care',
        dressingPerformed: hasInjury,
        dressingNotes: hasInjury ? 'Wound cleaned with saline, povidone dressing applied. Review in 48 hours.' : null,
        advice: 'Oral fluids, rest in shade, return if symptoms worsen.',
        medicalOfficerId: medicalOfficer.id,
        recordedAt: new Date(registeredAt.getTime() + randInt(8, 30) * 60_000),
        instanceId: randomUUID(),
      },
    });

    const wantsLab = ['ADD', 'AHF', 'AJS', 'PROLONGED_FEVER'].includes(syndromes[0]?.code ?? '');
    if (wantsLab && args.labFacility) {
      const collected = chance(0.6);
      await prisma.labOrder.create({
        data: {
          walkInId: walkIn.id,
          status: collected ? 'SAMPLE_COLLECTED' : 'ADVISED_REFERRED',
          samples: syndromes[0]?.code === 'ADD' ? ['STOOL'] : ['SERUM'],
          labFacilityId: args.labFacility.id,
          labelId: collected ? `L${randInt(100000, 999999)}` : null,
          transported: collected && chance(0.7),
        },
      });
    }

    // Prescription drawn from the camp's own stock.
    const lines: Array<{ code: string; pattern: string; days: number }> = [];
    if (presentation.symptoms.includes('DIARRHOEA') || presentation.symptoms.includes('DEHYDRATION')) {
      lines.push({ code: 'ORS', pattern: 'SOS', days: 3 });
    }
    if (presentation.symptoms.includes('FEVER') || hasInjury || presentation.symptoms.includes('HEADACHE') || presentation.symptoms.includes('JOINT_PAIN')) {
      lines.push({ code: 'PARACETAMOL', pattern: 'Q8H', days: 3 });
    }
    if (presentation.symptoms.includes('COUGH')) lines.push({ code: 'CETIRIZINE', pattern: '0-0-1', days: 3 });
    if (hasInjury) lines.push({ code: 'POVIDONE', pattern: '1-0-1', days: 5 });

    let lineNo = 0;
    for (const line of lines) {
      const drug = drugs.get(line.code);
      if (!drug) continue;
      lineNo += 1;
      const quantity = unitsRequired(line.pattern, line.days);
      await prisma.prescriptionLine.create({
        data: {
          walkInId: walkIn.id,
          lineNo,
          form: drug.form as never,
          drugId: drug.id,
          drugName: drug.name,
          dosagePattern: line.pattern,
          days: line.days,
          quantity,
          dispensed: stage === 'DISPENSED',
          dispensedAt: stage === 'DISPENSED' ? new Date(registeredAt.getTime() + randInt(15, 45) * 60_000) : null,
        },
      });
      if (stage === 'DISPENSED') {
        const key = `${camp.id}:${drug.id}:${dayKey(day)}`;
        consumption.set(key, (consumption.get(key) ?? 0) + quantity);
      }
    }
  }

  if (stage === 'REFERRED') {
    const speciality = presentation.categories.includes('SURGICAL') ? 'GENERAL_SURGERY' : 'GENERAL_MEDICINE';
    const facility =
      args.referralFacilities.find((f) => f.specialities.includes(speciality)) ?? args.referralFacilities[0];
    await prisma.referral.create({
      data: {
        walkInId: walkIn.id,
        facilityId: facility?.id ?? null,
        speciality,
        ambulanceRequested: triage.requiresAmbulance,
        ambulanceRef: triage.requiresAmbulance ? `108-${randInt(10000, 99999)}` : null,
        status: chance(0.6) ? 'ARRIVED' : chance(0.5) ? 'IN_TRANSIT' : 'AMBULANCE_DISPATCHED',
        reason: triage.reasons.join('; ') || 'Requires higher centre evaluation',
        requestedAt: new Date(registeredAt.getTime() + randInt(10, 25) * 60_000),
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
