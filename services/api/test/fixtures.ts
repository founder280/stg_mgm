import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { ALL_PERMISSIONS, DRUG_MASTER, FORM_NAME, FORM_VERSION, ROLE_LIST, SYMPTOMS, SYNDROMES, moduleOf } from '@mgms/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../src/db.js';

export const TEST_PASSWORD = 'TestPassw0rd!';

export interface Fixture {
  eventId: string;
  campA: { id: string; code: string; districtId: string };
  campB: { id: string; code: string; districtId: string };
  districtA: string;
  districtB: string;
  hamletA: string;
  zoneA: string;
  users: Record<string, { id: string; username: string }>;
  drugIds: Record<string, string>;
}

/** Wipe every table, respecting foreign keys. */
export async function resetDatabase() {
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

/**
 * A minimal but complete world: two districts, one camp in each, and one user
 * per role that the tests exercise. Deliberately small — a test that fails
 * should point at the behaviour, not at seed noise.
 */
export async function seedFixture(): Promise<Fixture> {
  await resetDatabase();

  await prisma.permission.createMany({
    data: ALL_PERMISSIONS.map((code) => ({ code, module: moduleOf(code) })),
  });
  const permissions = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));

  const roleIds: Record<string, string> = {};
  for (const definition of ROLE_LIST) {
    const role = await prisma.role.create({
      data: {
        code: definition.code,
        name: definition.name,
        scopeLevel: definition.scopeLevel,
        isSystem: true,
        permissions: {
          create: [...new Set(definition.permissions)].map((code) => ({ permissionId: permissions.get(code)! })),
        },
      },
    });
    roleIds[definition.code] = role.id;
  }

  await prisma.symptom.createMany({
    data: SYMPTOMS.map((s) => ({
      code: s.code,
      name: s.name,
      group: s.group,
      subFormat: s.subFormat,
      redFlag: s.redFlag ?? false,
      displayOrder: s.displayOrder,
    })),
  });

  for (const syndrome of SYNDROMES) {
    await prisma.syndromeDefinition.create({
      data: {
        code: syndrome.code,
        name: syndrome.name,
        caseDefinition: syndrome.caseDefinition,
        reference: syndrome.reference,
        priority: syndrome.priority,
        notifiable: syndrome.notifiable,
        rule: syndrome.rule as unknown as Prisma.InputJsonValue,
      },
    });
  }

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
  const drugIds = Object.fromEntries((await prisma.drug.findMany()).map((d) => [d.code, d.id]));

  const state = await prisma.addressUnit.create({
    data: { code: 'TG', name: 'Telangana', level: 'STATE', hierarchy: 'ADMIN', path: '', depth: 0 },
  });
  const districtA = await prisma.addressUnit.create({
    data: { code: 'D-A', name: 'District A', level: 'DISTRICT', parentId: state.id, path: `${state.id}/`, depth: 1, latitude: 12.2, longitude: 79.07 },
  });
  const districtB = await prisma.addressUnit.create({
    data: { code: 'D-B', name: 'District B', level: 'DISTRICT', parentId: state.id, path: `${state.id}/`, depth: 1, latitude: 11.7, longitude: 79.77 },
  });
  const villageA = await prisma.addressUnit.create({
    data: { code: 'V-A', name: 'Village A', level: 'VILLAGE', parentId: districtA.id, path: `${state.id}/${districtA.id}/`, depth: 2, latitude: 12.22, longitude: 79.06 },
  });
  const hamletA = await prisma.addressUnit.create({
    data: {
      code: 'H-A', name: 'Hamlet A', level: 'HAMLET', parentId: villageA.id,
      path: `${state.id}/${districtA.id}/${villageA.id}/`, depth: 3,
      latitude: 12.225, longitude: 79.058, population: 2000,
    },
  });

  const hospital = await prisma.facility.create({
    data: {
      code: 'HOSP-A', name: 'District Hospital A', type: 'DISTRICT_HOSPITAL',
      districtId: districtA.id, specialities: ['GENERAL_MEDICINE', 'TRAUMA'], isEmpanelled: true,
    },
  });

  const now = new Date();
  const event = await prisma.event.create({
    data: {
      code: 'TEST-EVENT',
      name: 'Test Gathering',
      startDate: new Date(now.getTime() - 5 * 86_400_000),
      endDate: new Date(now.getTime() + 5 * 86_400_000),
      stayReferenceDate: new Date(now.getTime() - 5 * 86_400_000),
      expectedFootfall: 100_000,
      districts: { create: [{ districtId: districtA.id }, { districtId: districtB.id }] },
    },
  });

  const zoneA = await prisma.eventZone.create({
    data: { eventId: event.id, code: 'Z-A', name: 'Zone A', latitude: 12.22, longitude: 79.07, expectedFootfall: 50_000 },
  });

  const campA = await prisma.camp.create({
    data: {
      eventId: event.id, code: 'CAMP-A', name: 'Camp A', districtId: districtA.id,
      zoneId: zoneA.id, latitude: 12.22, longitude: 79.07,
      symptomCodes: SYMPTOMS.map((s) => s.code), lastSyncAt: new Date(),
    },
  });
  const campB = await prisma.camp.create({
    data: {
      eventId: event.id, code: 'CAMP-B', name: 'Camp B', districtId: districtB.id,
      latitude: 11.7, longitude: 79.77, symptomCodes: SYMPTOMS.map((s) => s.code), lastSyncAt: new Date(),
    },
  });

  for (const drug of DRUG_MASTER) {
    await prisma.campInventory.create({ data: { campId: campA.id, drugId: drugIds[drug.code]!, onHand: 500 } });
  }

  const passwordHash = await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id });
  const users: Fixture['users'] = {};

  async function makeUser(username: string, roleCode: string, assignment?: { scopeType: string; scopeId: string }) {
    const user = await prisma.user.create({
      data: {
        username,
        fullName: username,
        passwordHash,
        roleId: roleIds[roleCode]!,
        assignments: assignment ? { create: [{ scopeType: assignment.scopeType as never, scopeId: assignment.scopeId }] } : undefined,
      },
    });
    users[username] = { id: user.id, username };
    return user;
  }

  await makeUser('state.admin', 'STATE_SUPER_ADMIN');
  await makeUser('state.officer', 'STATE_OFFICER');
  await makeUser('district.a', 'DISTRICT_USER', { scopeType: 'DISTRICT', scopeId: districtA.id });
  await makeUser('district.b', 'DISTRICT_USER', { scopeType: 'DISTRICT', scopeId: districtB.id });
  await makeUser('camp.volunteer', 'VOLUNTEER', { scopeType: 'CAMP', scopeId: campA.id });
  await makeUser('camp.staff', 'FIELD_STAFF', { scopeType: 'CAMP', scopeId: campA.id });
  await makeUser('camp.supervisor', 'SUPERVISOR', { scopeType: 'CAMP', scopeId: campA.id });
  await makeUser('unassigned', 'DISTRICT_USER');

  await prisma.facility.update({ where: { id: hospital.id }, data: { isActive: true } });

  return {
    eventId: event.id,
    campA: { id: campA.id, code: campA.code, districtId: districtA.id },
    campB: { id: campB.id, code: campB.code, districtId: districtB.id },
    districtA: districtA.id,
    districtB: districtB.id,
    hamletA: hamletA.id,
    zoneA: zoneA.id,
    users,
    drugIds,
  };
}

/** Capture metadata for a submission, with a fresh instance id each time. */
export function capture(username = 'camp.volunteer', instanceId = randomUUID()) {
  const now = new Date();
  return {
    formName: FORM_NAME,
    formVersion: FORM_VERSION,
    username,
    loginTime: new Date(now.getTime() - 3600_000).toISOString(),
    deviceId: 'TEST-DEVICE-01',
    instanceId,
    recordStartTime: new Date(now.getTime() - 300_000).toISOString(),
    recordEndTime: now.toISOString(),
  };
}

export function registrationPayload(campId: string, overrides: Record<string, unknown> = {}) {
  return {
    campId,
    name: 'Test Patient',
    age: { years: 34, months: 0, days: 0 },
    gender: 'MALE',
    residence: { residenceType: 'HOME_STATE', daysAtResidence: 400 },
    mobile: '9876543210',
    festivalStay: { years: 0, months: 0, days: 2 },
    symptoms: [{ symptomCode: 'FEVER', onsetDays: 2, onsetHours: 0 }],
    caseCategories: ['MEDICAL'],
    injuries: [],
    bites: [],
    onsetPlace: 'FESTIVAL_AREA',
    capture: capture(),
    ...overrides,
  };
}
