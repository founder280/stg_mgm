import { z } from 'zod';
import { ROLE_CODES, SCOPE_LEVELS } from '../rbac/roles.js';
import { ALL_PERMISSIONS } from '../rbac/permissions.js';
import { ADDRESS_HIERARCHIES, ADDRESS_LEVELS } from '../masters/address.js';
import { CAMP_TYPES, EQUIPMENT_STATUSES, FACILITY_TYPES, SHIFTS, SPECIALITIES } from '../masters/facilities.js';

const codes = <T extends readonly { code: string }[]>(list: T) =>
  list.map((i) => i.code) as [string, ...string[]];

export const loginSchema = z.object({
  username: z.string().min(3).max(120),
  password: z.string().min(8).max(200),
  deviceId: z.string().max(120).optional(),
});

export const createRoleSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,40}$/, 'Use UPPER_SNAKE_CASE'),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  scopeLevel: z.enum(SCOPE_LEVELS),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).default([]),
});

export const updateRoleSchema = createRoleSchema.partial().omit({ code: true });

export const createUserSchema = z.object({
  username: z.string().min(3).max(120),
  fullName: z.string().min(2).max(120),
  email: z.string().email().optional(),
  mobile: z.string().regex(/^(\+91)?[6-9]\d{9}$/).optional(),
  password: z.string().min(8).max(200),
  roleCode: z.string().min(2).max(40),
  designation: z.string().max(120).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  assignments: z
    .array(
      z.object({
        scopeType: z.enum(SCOPE_LEVELS),
        scopeId: z.string().uuid(),
      }),
    )
    .default([]),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true });

export const addressUnitSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  nameLocal: z.string().max(160).optional(),
  level: z.enum(ADDRESS_LEVELS),
  hierarchy: z.enum(ADDRESS_HIERARCHIES).default('ADMIN'),
  parentId: z.string().uuid().nullable().optional(),
  lgdCode: z.string().max(40).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  population: z.number().int().nonnegative().nullable().optional(),
  boundary: z.unknown().optional(),
});

export const facilitySchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(2).max(160),
  type: z.enum(codes(FACILITY_TYPES)),
  addressUnitId: z.string().uuid().nullable().optional(),
  districtId: z.string().uuid().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  specialities: z.array(z.enum(SPECIALITIES)).default([]),
  bedCapacity: z.number().int().nonnegative().nullable().optional(),
  contactName: z.string().max(120).optional(),
  contactPhone: z.string().max(20).optional(),
  isEmpanelled: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const eventSchema = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(160),
  description: z.string().max(1000).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  expectedFootfall: z.number().int().nonnegative().nullable().optional(),
  /** Reference date for "days stayed at the festival area before xx.xx.xxxx". */
  stayReferenceDate: z.coerce.date().nullable().optional(),
  districtIds: z.array(z.string().uuid()).default([]),
  isActive: z.boolean().default(true),
});

export const zoneSchema = z.object({
  eventId: z.string().uuid(),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  parentId: z.string().uuid().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  expectedFootfall: z.number().int().nonnegative().nullable().optional(),
  boundary: z.unknown().optional(),
});

export const campSchema = z.object({
  eventId: z.string().uuid(),
  code: z.string().min(1).max(40),
  name: z.string().min(2).max(160),
  type: z.enum(codes(CAMP_TYPES)),
  facilityId: z.string().uuid().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  districtId: z.string().uuid(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  inchargeUserId: z.string().uuid().nullable().optional(),
  opensAt: z.coerce.date().nullable().optional(),
  closesAt: z.coerce.date().nullable().optional(),
  /** Symptom codes offered by this camp's form, per "list may be edited". */
  symptomCodes: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export const rosterEntrySchema = z.object({
  campId: z.string().uuid(),
  userId: z.string().uuid(),
  dutyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(codes(SHIFTS)),
  role: z.string().max(80).optional(),
});

export const attendanceSchema = z.object({
  rosterEntryId: z.string().uuid(),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE']),
  markedAt: z.coerce.date().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  remarks: z.string().max(240).optional(),
});

/** Pre-camp readiness: venue, drugs, equipment, feedback, photographs. */
export const readinessSchema = z.object({
  campId: z.string().uuid(),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venueReady: z.boolean().default(false),
  venueRemarks: z.string().max(500).optional(),
  waterAvailable: z.boolean().default(false),
  powerAvailable: z.boolean().default(false),
  wasteDisposalReady: z.boolean().default(false),
  equipment: z
    .array(
      z.object({
        equipmentCode: z.string().max(40),
        status: z.enum(EQUIPMENT_STATUSES),
        quantity: z.number().int().nonnegative().default(0),
        remarks: z.string().max(240).optional(),
      }),
    )
    .default([]),
  feedback: z.string().max(1000).optional(),
  photos: z
    .array(
      z.object({
        kind: z.string().max(40),
        url: z.string().max(500),
        capturedAt: z.coerce.date().optional(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
      }),
    )
    .default([]),
});

export const stockTransactionSchema = z.object({
  campId: z.string().uuid(),
  drugId: z.string().uuid(),
  type: z.enum(['RECEIPT', 'ISSUE', 'RETURN', 'ADJUSTMENT', 'EXPIRY']),
  quantity: z.number().int(),
  batchNumber: z.string().max(60).optional(),
  expiryDate: z.coerce.date().nullable().optional(),
  reference: z.string().max(120).optional(),
  remarks: z.string().max(240).optional(),
});

export const ROLE_CODE_VALUES = ROLE_CODES;
