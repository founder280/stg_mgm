-- CreateEnum
CREATE TYPE "ScopeLevel" AS ENUM ('STATE', 'REGION', 'DEPARTMENT', 'DISTRICT', 'FACILITY', 'CAMP');

-- CreateEnum
CREATE TYPE "AddressHierarchy" AS ENUM ('ADMIN', 'REVENUE', 'HEALTH');

-- CreateEnum
CREATE TYPE "AddressLevel" AS ENUM ('COUNTRY', 'STATE', 'REGION', 'DISTRICT', 'TALUK', 'PANCHAYAT', 'HUD', 'BLOCK', 'PHC', 'HSC', 'VILLAGE', 'HAMLET');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('CAMP_SITE', 'PHC', 'CHC', 'DISTRICT_HOSPITAL', 'MEDICAL_COLLEGE', 'EMPANELLED_HOSPITAL', 'LABORATORY', 'DRUG_WAREHOUSE', 'AMBULANCE_BASE', 'CONTROL_ROOM');

-- CreateEnum
CREATE TYPE "CampType" AS ENUM ('MEDICAL_CAMP', 'FIRST_AID_POST', 'AMBULANCE_POINT', 'MOBILE_UNIT');

-- CreateEnum
CREATE TYPE "ShiftCode" AS ENUM ('MORNING', 'EVENING', 'NIGHT');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('FUNCTIONAL', 'NOT_FUNCTIONAL', 'NOT_AVAILABLE');

-- CreateEnum
CREATE TYPE "DrugForm" AS ENUM ('TABLET', 'SYRUP', 'SACHET', 'IVF', 'INJECTION', 'OINTMENT');

-- CreateEnum
CREATE TYPE "StockTxnType" AS ENUM ('RECEIPT', 'ISSUE', 'RETURN', 'ADJUSTMENT', 'EXPIRY');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'TRANSGENDER');

-- CreateEnum
CREATE TYPE "ResidenceType" AS ENUM ('HOME_STATE', 'OTHER_STATE', 'FOREIGNER');

-- CreateEnum
CREATE TYPE "OnsetPlace" AS ENUM ('HOME', 'FESTIVAL_AREA', 'ENROUTE');

-- CreateEnum
CREATE TYPE "WalkInStage" AS ENUM ('REGISTERED', 'VITALS_DONE', 'CLINICAL_DONE', 'DISPENSED', 'REFERRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('GREEN', 'YELLOW', 'ORANGE', 'RED');

-- CreateEnum
CREATE TYPE "InjuryType" AS ENUM ('ABRASION', 'LACERATION', 'FRACTURE');

-- CreateEnum
CREATE TYPE "BiteType" AS ENUM ('SNAKE', 'SCORPION', 'RABID_ANIMAL', 'INSECT', 'OTHER_ANIMAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LabOrderStatus" AS ENUM ('NOT_ADVISED', 'ADVISED_REFERRED', 'SAMPLE_COLLECTED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('REQUESTED', 'AMBULANCE_DISPATCHED', 'IN_TRANSIT', 'ARRIVED', 'ADMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('ABERRATION', 'SPATIAL_CLUSTER', 'CRITICAL_CASE', 'STOCKOUT', 'CAMP_NOT_READY', 'SYNC_STALE', 'REFERRAL_DELAY');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scopeLevel" "ScopeLevel" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "passwordHash" TEXT NOT NULL,
    "designation" TEXT,
    "roleId" TEXT NOT NULL,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeType" "ScopeLevel" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address_units" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLocal" TEXT,
    "level" "AddressLevel" NOT NULL,
    "hierarchy" "AddressHierarchy" NOT NULL DEFAULT 'ADMIN',
    "parentId" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "lgdCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "population" INTEGER,
    "boundary" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "address_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FacilityType" NOT NULL,
    "addressUnitId" TEXT,
    "districtId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "specialities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bedCapacity" INTEGER,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "isEmpanelled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "expectedFootfall" INTEGER,
    "stayReferenceDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_districts" (
    "eventId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,

    CONSTRAINT "event_districts_pkey" PRIMARY KEY ("eventId","districtId")
);

-- CreateTable
CREATE TABLE "event_zones" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "expectedFootfall" INTEGER,
    "boundary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camps" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CampType" NOT NULL DEFAULT 'MEDICAL_CAMP',
    "facilityId" TEXT,
    "zoneId" TEXT,
    "districtId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "inchargeUserId" TEXT,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "symptomCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSyncAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_entries" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dutyDate" DATE NOT NULL,
    "shift" "ShiftCode" NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roster_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "rosterEntryId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "markedById" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "remarks" TEXT,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camp_readiness" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "venueReady" BOOLEAN NOT NULL DEFAULT false,
    "venueRemarks" TEXT,
    "waterAvailable" BOOLEAN NOT NULL DEFAULT false,
    "powerAvailable" BOOLEAN NOT NULL DEFAULT false,
    "wasteDisposalReady" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT,
    "reportedById" TEXT,
    "readinessPercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camp_readiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_equipment" (
    "id" TEXT NOT NULL,
    "readinessId" TEXT NOT NULL,
    "equipmentCode" TEXT NOT NULL,
    "status" "EquipmentStatus" NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,

    CONSTRAINT "readiness_equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camp_photos" (
    "id" TEXT NOT NULL,
    "readinessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camp_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drugs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "form" "DrugForm" NOT NULL,
    "strength" TEXT,
    "emergencyTray" BOOLEAN NOT NULL DEFAULT false,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drugs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camp_inventory" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camp_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transactions" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "drugId" TEXT NOT NULL,
    "type" "StockTxnType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "reference" TEXT,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symptoms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameLocal" TEXT,
    "group" TEXT NOT NULL,
    "subFormat" TEXT,
    "redFlag" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "symptoms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syndrome_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "caseDefinition" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notifiable" BOOLEAN NOT NULL DEFAULT false,
    "rule" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syndrome_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walk_ins" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "tokenNumber" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ageYears" INTEGER NOT NULL DEFAULT 0,
    "ageMonths" INTEGER NOT NULL DEFAULT 0,
    "ageDays" INTEGER NOT NULL DEFAULT 0,
    "ageTotalMonths" DOUBLE PRECISION NOT NULL,
    "ageBand" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "residenceType" "ResidenceType" NOT NULL,
    "residenceUnitId" TEXT,
    "residenceText" TEXT,
    "countryCode" TEXT,
    "daysAtResidence" INTEGER,
    "mobile" TEXT,
    "stayYears" INTEGER NOT NULL DEFAULT 0,
    "stayMonths" INTEGER NOT NULL DEFAULT 0,
    "stayDays" INTEGER NOT NULL DEFAULT 0,
    "stayTotalDays" INTEGER NOT NULL DEFAULT 0,
    "caseCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "otherSymptomText" TEXT,
    "onsetPlace" "OnsetPlace" NOT NULL,
    "onsetZoneId" TEXT,
    "onsetAddressUnitId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationAccuracyM" DOUBLE PRECISION,
    "stage" "WalkInStage" NOT NULL DEFAULT 'REGISTERED',
    "triageLevel" "TriageLevel" NOT NULL DEFAULT 'GREEN',
    "triageScore" INTEGER NOT NULL DEFAULT 0,
    "triageReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "primarySyndromeCode" TEXT,
    "registeredById" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "formName" TEXT NOT NULL,
    "formVersion" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "captureUsername" TEXT NOT NULL,
    "loginTime" TIMESTAMP(3) NOT NULL,
    "recordStartTime" TIMESTAMP(3) NOT NULL,
    "recordEndTime" TIMESTAMP(3) NOT NULL,
    "receivedTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "walk_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walk_in_symptoms" (
    "id" TEXT NOT NULL,
    "walkInId" TEXT NOT NULL,
    "symptomId" TEXT NOT NULL,
    "symptomCode" TEXT NOT NULL,
    "onsetDays" INTEGER NOT NULL DEFAULT 1,
    "onsetHours" INTEGER NOT NULL DEFAULT 0,
    "onsetTotalHours" INTEGER NOT NULL DEFAULT 24,
    "note" TEXT,

    CONSTRAINT "walk_in_symptoms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "injury_details" (
    "id" TEXT NOT NULL,
    "walkInId" TEXT NOT NULL,
    "injuryType" "InjuryType" NOT NULL,
    "bodySite" TEXT,
    "lengthCm" DOUBLE PRECISION,
    "markerX" DOUBLE PRECISION,
    "markerY" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "injury_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bite_details" (
    "id" TEXT NOT NULL,
    "walkInId" TEXT NOT NULL,
    "biteType" "BiteType" NOT NULL,
    "bodySite" TEXT,
    "note" TEXT,

    CONSTRAINT "bite_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walk_in_syndromes" (
    "id" TEXT NOT NULL,
    "walkInId" TEXT NOT NULL,
    "syndromeId" TEXT NOT NULL,
    "syndromeCode" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT NOT NULL,

    CONSTRAINT "walk_in_syndromes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vitals" (
    "id" TEXT NOT NULL,
    "walkInId" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "bmiCategory" TEXT,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "bpStage" TEXT,
    "newlyDetectedHypertension" BOOLEAN NOT NULL DEFAULT false,
    "pulse" INTEGER,
    "temperatureF" DOUBLE PRECISION,
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,
    "instanceId" TEXT,
    "recordStartTime" TIMESTAMP(3),
    "recordEndTime" TIMESTAMP(3),

    CONSTRAINT "vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_records" (
    "id" TEXT NOT NULL,
    "walkInId" TEXT NOT NULL,
    "provisionalDiagnosis" TEXT,
    "dressingPerformed" BOOLEAN NOT NULL DEFAULT false,
    "dressingNotes" TEXT,
    "reviewAdvisedOn" TIMESTAMP(3),
    "advice" TEXT,
    "medicalOfficerId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,
    "instanceId" TEXT,
    "recordStartTime" TIMESTAMP(3),
    "recordEndTime" TIMESTAMP(3),

    CONSTRAINT "clinical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_orders" (
    "id" TEXT NOT NULL,
    "walkInId" TEXT NOT NULL,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'NOT_ADVISED',
    "samples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labFacilityId" TEXT,
    "labelId" TEXT,
    "transported" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_lines" (
    "id" TEXT NOT NULL,
    "walkInId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "form" "DrugForm" NOT NULL,
    "drugId" TEXT,
    "drugName" TEXT NOT NULL,
    "dosagePattern" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 3,
    "quantity" INTEGER NOT NULL,
    "dispensed" BOOLEAN NOT NULL DEFAULT false,
    "dispensedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "prescription_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "walkInId" TEXT NOT NULL,
    "facilityId" TEXT,
    "speciality" TEXT,
    "ambulanceRequested" BOOLEAN NOT NULL DEFAULT false,
    "ambulanceRef" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_batches" (
    "id" TEXT NOT NULL,
    "campId" TEXT,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT,
    "appVersion" TEXT,
    "operationCount" INTEGER NOT NULL DEFAULT 0,
    "applied" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "sync_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidence" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "eventId" TEXT,
    "campId" TEXT,
    "districtId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "users_departmentId_idx" ON "users"("departmentId");

-- CreateIndex
CREATE INDEX "user_assignments_scopeType_scopeId_idx" ON "user_assignments"("scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "user_assignments_userId_scopeType_scopeId_key" ON "user_assignments"("userId", "scopeType", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "address_units_parentId_idx" ON "address_units"("parentId");

-- CreateIndex
CREATE INDEX "address_units_level_hierarchy_idx" ON "address_units"("level", "hierarchy");

-- CreateIndex
CREATE INDEX "address_units_path_idx" ON "address_units"("path");

-- CreateIndex
CREATE UNIQUE INDEX "address_units_hierarchy_code_key" ON "address_units"("hierarchy", "code");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_code_key" ON "facilities"("code");

-- CreateIndex
CREATE INDEX "facilities_type_idx" ON "facilities"("type");

-- CreateIndex
CREATE INDEX "facilities_districtId_idx" ON "facilities"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "events_code_key" ON "events"("code");

-- CreateIndex
CREATE INDEX "event_zones_parentId_idx" ON "event_zones"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "event_zones_eventId_code_key" ON "event_zones"("eventId", "code");

-- CreateIndex
CREATE INDEX "camps_districtId_idx" ON "camps"("districtId");

-- CreateIndex
CREATE INDEX "camps_zoneId_idx" ON "camps"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "camps_eventId_code_key" ON "camps"("eventId", "code");

-- CreateIndex
CREATE INDEX "roster_entries_campId_dutyDate_idx" ON "roster_entries"("campId", "dutyDate");

-- CreateIndex
CREATE UNIQUE INDEX "roster_entries_campId_userId_dutyDate_shift_key" ON "roster_entries"("campId", "userId", "dutyDate", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_rosterEntryId_key" ON "attendance"("rosterEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "camp_readiness_campId_reportDate_key" ON "camp_readiness"("campId", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_equipment_readinessId_equipmentCode_key" ON "readiness_equipment"("readinessId", "equipmentCode");

-- CreateIndex
CREATE UNIQUE INDEX "drugs_code_key" ON "drugs"("code");

-- CreateIndex
CREATE INDEX "camp_inventory_campId_idx" ON "camp_inventory"("campId");

-- CreateIndex
CREATE UNIQUE INDEX "camp_inventory_campId_drugId_key" ON "camp_inventory"("campId", "drugId");

-- CreateIndex
CREATE INDEX "stock_transactions_campId_drugId_createdAt_idx" ON "stock_transactions"("campId", "drugId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "symptoms_code_key" ON "symptoms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "syndrome_definitions_code_key" ON "syndrome_definitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "walk_ins_instanceId_key" ON "walk_ins"("instanceId");

-- CreateIndex
CREATE INDEX "walk_ins_campId_stage_idx" ON "walk_ins"("campId", "stage");

-- CreateIndex
CREATE INDEX "walk_ins_eventId_registeredAt_idx" ON "walk_ins"("eventId", "registeredAt");

-- CreateIndex
CREATE INDEX "walk_ins_districtId_registeredAt_idx" ON "walk_ins"("districtId", "registeredAt");

-- CreateIndex
CREATE INDEX "walk_ins_primarySyndromeCode_registeredAt_idx" ON "walk_ins"("primarySyndromeCode", "registeredAt");

-- CreateIndex
CREATE INDEX "walk_ins_triageLevel_stage_idx" ON "walk_ins"("triageLevel", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "walk_ins_campId_tokenNumber_key" ON "walk_ins"("campId", "tokenNumber");

-- CreateIndex
CREATE INDEX "walk_in_symptoms_symptomCode_idx" ON "walk_in_symptoms"("symptomCode");

-- CreateIndex
CREATE UNIQUE INDEX "walk_in_symptoms_walkInId_symptomId_key" ON "walk_in_symptoms"("walkInId", "symptomId");

-- CreateIndex
CREATE INDEX "injury_details_walkInId_idx" ON "injury_details"("walkInId");

-- CreateIndex
CREATE INDEX "bite_details_walkInId_idx" ON "bite_details"("walkInId");

-- CreateIndex
CREATE INDEX "walk_in_syndromes_syndromeCode_idx" ON "walk_in_syndromes"("syndromeCode");

-- CreateIndex
CREATE UNIQUE INDEX "walk_in_syndromes_walkInId_syndromeId_key" ON "walk_in_syndromes"("walkInId", "syndromeId");

-- CreateIndex
CREATE UNIQUE INDEX "vitals_walkInId_key" ON "vitals"("walkInId");

-- CreateIndex
CREATE UNIQUE INDEX "vitals_instanceId_key" ON "vitals"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_records_walkInId_key" ON "clinical_records"("walkInId");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_records_instanceId_key" ON "clinical_records"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_orders_walkInId_key" ON "lab_orders"("walkInId");

-- CreateIndex
CREATE INDEX "lab_orders_status_idx" ON "lab_orders"("status");

-- CreateIndex
CREATE INDEX "prescription_lines_drugId_idx" ON "prescription_lines"("drugId");

-- CreateIndex
CREATE UNIQUE INDEX "prescription_lines_walkInId_lineNo_key" ON "prescription_lines"("walkInId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_walkInId_key" ON "referrals"("walkInId");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE INDEX "sync_batches_deviceId_receivedAt_idx" ON "sync_batches"("deviceId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_dedupeKey_key" ON "alerts"("dedupeKey");

-- CreateIndex
CREATE INDEX "alerts_severity_acknowledgedAt_idx" ON "alerts"("severity", "acknowledgedAt");

-- CreateIndex
CREATE INDEX "alerts_eventId_createdAt_idx" ON "alerts"("eventId", "createdAt");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_assignments" ADD CONSTRAINT "user_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_units" ADD CONSTRAINT "address_units_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "address_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_addressUnitId_fkey" FOREIGN KEY ("addressUnitId") REFERENCES "address_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "address_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_districts" ADD CONSTRAINT "event_districts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_districts" ADD CONSTRAINT "event_districts_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "address_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_zones" ADD CONSTRAINT "event_zones_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_zones" ADD CONSTRAINT "event_zones_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "event_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "event_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "address_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camps" ADD CONSTRAINT "camps_inchargeUserId_fkey" FOREIGN KEY ("inchargeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_rosterEntryId_fkey" FOREIGN KEY ("rosterEntryId") REFERENCES "roster_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_readiness" ADD CONSTRAINT "camp_readiness_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness_equipment" ADD CONSTRAINT "readiness_equipment_readinessId_fkey" FOREIGN KEY ("readinessId") REFERENCES "camp_readiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_photos" ADD CONSTRAINT "camp_photos_readinessId_fkey" FOREIGN KEY ("readinessId") REFERENCES "camp_readiness"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_inventory" ADD CONSTRAINT "camp_inventory_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_inventory" ADD CONSTRAINT "camp_inventory_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "drugs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "drugs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_ins" ADD CONSTRAINT "walk_ins_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_ins" ADD CONSTRAINT "walk_ins_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_ins" ADD CONSTRAINT "walk_ins_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "address_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_ins" ADD CONSTRAINT "walk_ins_residenceUnitId_fkey" FOREIGN KEY ("residenceUnitId") REFERENCES "address_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_ins" ADD CONSTRAINT "walk_ins_onsetZoneId_fkey" FOREIGN KEY ("onsetZoneId") REFERENCES "event_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_ins" ADD CONSTRAINT "walk_ins_onsetAddressUnitId_fkey" FOREIGN KEY ("onsetAddressUnitId") REFERENCES "address_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_ins" ADD CONSTRAINT "walk_ins_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_in_symptoms" ADD CONSTRAINT "walk_in_symptoms_walkInId_fkey" FOREIGN KEY ("walkInId") REFERENCES "walk_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_in_symptoms" ADD CONSTRAINT "walk_in_symptoms_symptomId_fkey" FOREIGN KEY ("symptomId") REFERENCES "symptoms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "injury_details" ADD CONSTRAINT "injury_details_walkInId_fkey" FOREIGN KEY ("walkInId") REFERENCES "walk_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bite_details" ADD CONSTRAINT "bite_details_walkInId_fkey" FOREIGN KEY ("walkInId") REFERENCES "walk_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_in_syndromes" ADD CONSTRAINT "walk_in_syndromes_walkInId_fkey" FOREIGN KEY ("walkInId") REFERENCES "walk_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walk_in_syndromes" ADD CONSTRAINT "walk_in_syndromes_syndromeId_fkey" FOREIGN KEY ("syndromeId") REFERENCES "syndrome_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_walkInId_fkey" FOREIGN KEY ("walkInId") REFERENCES "walk_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_walkInId_fkey" FOREIGN KEY ("walkInId") REFERENCES "walk_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_records" ADD CONSTRAINT "clinical_records_medicalOfficerId_fkey" FOREIGN KEY ("medicalOfficerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_walkInId_fkey" FOREIGN KEY ("walkInId") REFERENCES "walk_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_labFacilityId_fkey" FOREIGN KEY ("labFacilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_lines" ADD CONSTRAINT "prescription_lines_walkInId_fkey" FOREIGN KEY ("walkInId") REFERENCES "walk_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_lines" ADD CONSTRAINT "prescription_lines_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "drugs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_walkInId_fkey" FOREIGN KEY ("walkInId") REFERENCES "walk_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_batches" ADD CONSTRAINT "sync_batches_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "address_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
