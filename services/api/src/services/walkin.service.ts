import {
  ageBand,
  ageInMonths,
  canTransition,
  classifySyndromes,
  deriveVitals,
  scoreTriage,
  type ClinicalSubmission,
  type RegistrationInput,
  type SyndromeDefinition,
  type SyndromeInput,
  type VitalsSubmission,
  type WalkInStage,
} from '@mgms/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { ApiError } from '../errors.js';
import { logger } from '../logger.js';
import { adjustStock } from './inventory.service.js';
import { raiseCriticalCaseAlert } from './alert.service.js';

/** Syndrome case definitions are stored in the database so they can be edited. */
export async function loadSyndromeDefinitions(): Promise<SyndromeDefinition[]> {
  const rows = await prisma.syndromeDefinition.findMany({ where: { isActive: true } });
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    caseDefinition: r.caseDefinition,
    reference: r.reference,
    priority: r.priority,
    notifiable: r.notifiable,
    rule: r.rule as never,
  }));
}

/**
 * Allocate the next token for a camp-day.
 *
 * Two devices can register a walk-in in the same millisecond, so the sequence
 * is derived inside the write and retried against the (campId, tokenNumber)
 * unique constraint rather than trusting a read-then-write count.
 */
async function nextTokenNumber(campCode: string, campId: string, when: Date): Promise<string> {
  const dayStart = new Date(when);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const count = await prisma.walkIn.count({
    where: { campId, registeredAt: { gte: dayStart, lt: dayEnd } },
  });
  const stamp = dayStart.toISOString().slice(0, 10).replace(/-/g, '');
  return `${campCode}-${stamp}-${String(count + 1).padStart(4, '0')}`;
}

export interface RegistrationContext {
  userId: string;
  ipAddress?: string;
}

export interface RegistrationResult {
  walkInId: string;
  tokenNumber: string;
  duplicate: boolean;
  primarySyndromeCode: string | null;
  triageLevel: string;
}

export async function registerWalkIn(
  input: RegistrationInput,
  context: RegistrationContext,
): Promise<RegistrationResult> {
  // Idempotency: the device's instance id is the key, so replaying a sync
  // batch after a dropped connection can never duplicate a patient.
  const existing = await prisma.walkIn.findUnique({
    where: { instanceId: input.capture.instanceId },
    select: { id: true, tokenNumber: true, primarySyndromeCode: true, triageLevel: true },
  });
  if (existing) {
    return {
      walkInId: existing.id,
      tokenNumber: existing.tokenNumber,
      duplicate: true,
      primarySyndromeCode: existing.primarySyndromeCode,
      triageLevel: existing.triageLevel,
    };
  }

  const camp = await prisma.camp.findUnique({
    where: { id: input.campId },
    select: { id: true, code: true, eventId: true, districtId: true, zoneId: true, isActive: true },
  });
  if (!camp) throw ApiError.notFound('Camp not found');
  if (!camp.isActive) throw ApiError.unprocessable('This camp is not accepting registrations');

  const [symptomRows, syndromeRows] = await Promise.all([
    prisma.symptom.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
    loadSyndromeDefinitions(),
  ]);
  const symptomIds = new Map(symptomRows.map((s) => [s.code, s.id]));

  const unknown = input.symptoms.filter((s) => !symptomIds.has(s.symptomCode));
  if (unknown.length > 0) {
    throw ApiError.badRequest(`Unknown symptom codes: ${unknown.map((s) => s.symptomCode).join(', ')}`);
  }

  const totalMonths = ageInMonths(input.age.years, input.age.months, input.age.days);
  const biteTypes = input.bites.map((b) => b.biteType) as SyndromeInput['biteTypes'];

  const syndromeInput: SyndromeInput = {
    symptoms: Object.fromEntries(
      input.symptoms.map((s) => [s.symptomCode, s.onsetDays * 24 + s.onsetHours]),
    ),
    biteTypes,
    hasInjury: input.injuries.length > 0,
    ageMonths: totalMonths,
  };
  const syndromes = classifySyndromes(syndromeInput, syndromeRows);

  const triage = scoreTriage({
    symptomCodes: input.symptoms.map((s) => s.symptomCode),
    biteTypes,
    caseCategories: input.caseCategories as never,
    ageMonths: totalMonths,
  });

  const syndromeIdByCode = new Map(
    (await prisma.syndromeDefinition.findMany({ select: { id: true, code: true } })).map((s) => [s.code, s.id]),
  );

  const stayTotalDays = input.festivalStay.years * 365 + input.festivalStay.months * 30 + input.festivalStay.days;
  const registeredAt = input.capture.recordEndTime ?? new Date();

  // Retry the token allocation if a concurrent registration takes the number.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const tokenNumber = await nextTokenNumber(camp.code, camp.id, registeredAt);
    try {
      const walkIn = await prisma.walkIn.create({
        data: {
          instanceId: input.capture.instanceId,
          tokenNumber,
          campId: camp.id,
          eventId: camp.eventId,
          districtId: camp.districtId,
          name: input.name,
          ageYears: input.age.years,
          ageMonths: input.age.months,
          ageDays: input.age.days,
          ageTotalMonths: totalMonths,
          ageBand: ageBand(totalMonths),
          gender: input.gender,
          residenceType: input.residence.residenceType as never,
          residenceUnitId: input.residence.addressUnitId ?? null,
          residenceText: input.residence.addressText ?? null,
          countryCode: input.residence.countryCode ?? null,
          daysAtResidence: input.residence.daysAtResidence ?? null,
          mobile: input.mobile ?? null,
          stayYears: input.festivalStay.years,
          stayMonths: input.festivalStay.months,
          stayDays: input.festivalStay.days,
          stayTotalDays,
          caseCategories: input.caseCategories,
          otherSymptomText: input.otherSymptomText ?? null,
          onsetPlace: input.onsetPlace as never,
          onsetZoneId: input.onsetZoneId ?? camp.zoneId,
          onsetAddressUnitId: input.onsetAddressUnitId ?? null,
          latitude: input.location?.latitude ?? null,
          longitude: input.location?.longitude ?? null,
          locationAccuracyM: input.location?.accuracyM ?? null,
          stage: 'REGISTERED',
          triageLevel: triage.level,
          triageScore: triage.score,
          triageReasons: triage.reasons,
          primarySyndromeCode: syndromes[0]?.code ?? null,
          registeredById: context.userId,
          registeredAt,
          formName: input.capture.formName,
          formVersion: input.capture.formVersion,
          deviceId: input.capture.deviceId,
          captureUsername: input.capture.username,
          loginTime: input.capture.loginTime,
          recordStartTime: input.capture.recordStartTime,
          recordEndTime: input.capture.recordEndTime,
          submittedIp: context.ipAddress ?? null,
          symptoms: {
            create: input.symptoms.map((s) => ({
              symptomId: symptomIds.get(s.symptomCode)!,
              symptomCode: s.symptomCode,
              onsetDays: s.onsetDays,
              onsetHours: s.onsetHours,
              onsetTotalHours: s.onsetDays * 24 + s.onsetHours,
              note: s.note,
            })),
          },
          injuries: { create: input.injuries.map((i) => ({ ...i, injuryType: i.injuryType as never })) },
          bites: { create: input.bites.map((b) => ({ ...b, biteType: b.biteType as never })) },
          syndromes: {
            create: syndromes
              .filter((s) => syndromeIdByCode.has(s.code))
              .map((s, idx) => ({
                syndromeId: syndromeIdByCode.get(s.code)!,
                syndromeCode: s.code,
                isPrimary: idx === 0,
                reference: s.reference,
              })),
          },
        },
        select: { id: true, tokenNumber: true },
      });

      await prisma.camp.update({ where: { id: camp.id }, data: { lastSyncAt: new Date() } });

      if (triage.level === 'RED') {
        await raiseCriticalCaseAlert(walkIn.id).catch((error) =>
          logger.warn({ err: error }, 'Failed to raise critical case alert'),
        );
      }

      return {
        walkInId: walkIn.id,
        tokenNumber: walkIn.tokenNumber,
        duplicate: false,
        primarySyndromeCode: syndromes[0]?.code ?? null,
        triageLevel: triage.level,
      };
    } catch (error) {
      const isTokenClash =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta?.target as string[] | undefined)?.includes('tokenNumber');
      if (!isTokenClash) throw error;
    }
  }

  throw ApiError.conflict('Could not allocate a token number, please retry');
}

/** Screen 6 — measurements, submitted by the paramedic leg of the split form. */
export async function recordVitals(walkInId: string, input: VitalsSubmission, userId: string) {
  const walkIn = await prisma.walkIn.findUnique({
    where: { id: walkInId },
    include: { symptoms: true, bites: true },
  });
  if (!walkIn) throw ApiError.notFound('Walk-in not found');
  if (walkIn.stage === 'CLOSED') throw ApiError.unprocessable('This record is closed');

  if (input.capture.instanceId) {
    const duplicate = await prisma.vitals.findUnique({ where: { instanceId: input.capture.instanceId } });
    if (duplicate) return { duplicate: true, vitalsId: duplicate.id };
  }

  const derived = deriveVitals(input);

  // Vitals can change the triage decision, so it is recomputed rather than
  // left at the value registration produced.
  const triage = scoreTriage({
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    systolic: input.systolic,
    diastolic: input.diastolic,
    pulse: input.pulse,
    temperatureF: input.temperatureF,
    symptomCodes: walkIn.symptoms.map((s) => s.symptomCode),
    biteTypes: walkIn.bites.map((b) => b.biteType) as never,
    caseCategories: walkIn.caseCategories as never,
    ageMonths: walkIn.ageTotalMonths,
  });

  const vitals = await prisma.vitals.upsert({
    where: { walkInId },
    create: {
      walkInId,
      weightKg: input.weightKg ?? null,
      heightCm: input.heightCm ?? null,
      bmi: derived.bmi,
      bmiCategory: derived.bmiCategory,
      systolic: input.systolic ?? null,
      diastolic: input.diastolic ?? null,
      bpStage: derived.bpStage,
      newlyDetectedHypertension: derived.newlyDetectedHypertension,
      pulse: input.pulse ?? null,
      temperatureF: input.temperatureF ?? null,
      recordedById: userId,
      deviceId: input.capture.deviceId,
      instanceId: input.capture.instanceId,
      recordStartTime: input.capture.recordStartTime,
      recordEndTime: input.capture.recordEndTime,
    },
    update: {
      weightKg: input.weightKg ?? null,
      heightCm: input.heightCm ?? null,
      bmi: derived.bmi,
      bmiCategory: derived.bmiCategory,
      systolic: input.systolic ?? null,
      diastolic: input.diastolic ?? null,
      bpStage: derived.bpStage,
      newlyDetectedHypertension: derived.newlyDetectedHypertension,
      pulse: input.pulse ?? null,
      temperatureF: input.temperatureF ?? null,
      recordedById: userId,
    },
  });

  const stage: WalkInStage = canTransition(walkIn.stage as WalkInStage, 'VITALS_DONE')
    ? 'VITALS_DONE'
    : (walkIn.stage as WalkInStage);

  await prisma.walkIn.update({
    where: { id: walkInId },
    data: { stage, triageLevel: triage.level, triageScore: triage.score, triageReasons: triage.reasons },
  });

  if (triage.level === 'RED' && walkIn.triageLevel !== 'RED') {
    await raiseCriticalCaseAlert(walkInId).catch((error) =>
      logger.warn({ err: error }, 'Failed to raise critical case alert'),
    );
  }

  return { duplicate: false, vitalsId: vitals.id, triage, derived };
}

/** Screens 7-9 — labs, treatment, dressing and referral, by the medical officer. */
export async function recordClinical(walkInId: string, input: ClinicalSubmission, userId: string) {
  const walkIn = await prisma.walkIn.findUnique({
    where: { id: walkInId },
    select: { id: true, campId: true, stage: true },
  });
  if (!walkIn) throw ApiError.notFound('Walk-in not found');
  if (walkIn.stage === 'CLOSED') throw ApiError.unprocessable('This record is closed');

  if (input.capture.instanceId) {
    const duplicate = await prisma.clinicalRecord.findUnique({
      where: { instanceId: input.capture.instanceId },
    });
    if (duplicate) return { duplicate: true, clinicalId: duplicate.id };
  }

  const record = await prisma.$transaction(async (tx) => {
    const clinical = await tx.clinicalRecord.upsert({
      where: { walkInId },
      create: {
        walkInId,
        provisionalDiagnosis: input.provisionalDiagnosis ?? null,
        dressingPerformed: input.dressing?.performed ?? false,
        dressingNotes: input.dressing?.notes ?? null,
        reviewAdvisedOn: input.dressing?.reviewAdvisedOn ?? null,
        advice: input.advice ?? null,
        medicalOfficerId: userId,
        deviceId: input.capture.deviceId,
        instanceId: input.capture.instanceId,
        recordStartTime: input.capture.recordStartTime,
        recordEndTime: input.capture.recordEndTime,
      },
      update: {
        provisionalDiagnosis: input.provisionalDiagnosis ?? null,
        dressingPerformed: input.dressing?.performed ?? false,
        dressingNotes: input.dressing?.notes ?? null,
        reviewAdvisedOn: input.dressing?.reviewAdvisedOn ?? null,
        advice: input.advice ?? null,
        medicalOfficerId: userId,
      },
    });

    if (input.labOrder) {
      await tx.labOrder.upsert({
        where: { walkInId },
        create: {
          walkInId,
          status: input.labOrder.status as never,
          samples: input.labOrder.samples,
          labFacilityId: input.labOrder.labFacilityId ?? null,
          labelId: input.labOrder.labelId ?? null,
          note: input.labOrder.note ?? null,
        },
        update: {
          status: input.labOrder.status as never,
          samples: input.labOrder.samples,
          labFacilityId: input.labOrder.labFacilityId ?? null,
          labelId: input.labOrder.labelId ?? null,
          note: input.labOrder.note ?? null,
        },
      });
    }

    await tx.prescriptionLine.deleteMany({ where: { walkInId } });
    for (const [index, line] of input.prescriptions.entries()) {
      await tx.prescriptionLine.create({
        data: {
          walkInId,
          lineNo: index + 1,
          form: line.form as never,
          drugId: line.drugId ?? null,
          drugName: line.drugName,
          dosagePattern: line.dosagePattern,
          days: line.days,
          quantity: line.quantity,
          note: line.note ?? null,
        },
      });
    }

    if (input.referral?.required) {
      await tx.referral.upsert({
        where: { walkInId },
        create: {
          walkInId,
          facilityId: input.referral.facilityId ?? null,
          speciality: input.referral.speciality ?? null,
          ambulanceRequested: input.referral.ambulanceRequested,
          reason: input.referral.reason ?? null,
        },
        update: {
          facilityId: input.referral.facilityId ?? null,
          speciality: input.referral.speciality ?? null,
          ambulanceRequested: input.referral.ambulanceRequested,
          reason: input.referral.reason ?? null,
        },
      });
    }

    await tx.walkIn.update({
      where: { id: walkInId },
      data: { stage: input.referral?.required ? 'REFERRED' : 'CLINICAL_DONE' },
    });

    return clinical;
  });

  return { duplicate: false, clinicalId: record.id };
}

/** Pharmacy issues the prescription and the camp's stock ledger is written. */
export async function dispensePrescription(walkInId: string, userId: string) {
  const walkIn = await prisma.walkIn.findUnique({
    where: { id: walkInId },
    include: { prescriptionLines: true },
  });
  if (!walkIn) throw ApiError.notFound('Walk-in not found');
  if (walkIn.prescriptionLines.length === 0) {
    throw ApiError.unprocessable('There is no prescription to dispense');
  }
  if (!canTransition(walkIn.stage as WalkInStage, 'DISPENSED')) {
    throw ApiError.unprocessable(`Cannot dispense a walk-in at stage ${walkIn.stage}`);
  }

  const shortages: string[] = [];
  for (const line of walkIn.prescriptionLines) {
    if (line.dispensed || !line.drugId) continue;
    const result = await adjustStock({
      campId: walkIn.campId,
      drugId: line.drugId,
      quantity: -line.quantity,
      type: 'ISSUE',
      reference: `Walk-in ${walkIn.tokenNumber}`,
      userId,
    });
    if (!result.ok) {
      shortages.push(`${line.drugName} (needed ${line.quantity}, available ${result.available})`);
      continue;
    }
    await prisma.prescriptionLine.update({
      where: { id: line.id },
      data: { dispensed: true, dispensedAt: new Date() },
    });
  }

  // Referral outranks dispensing: an ambulance is still en route, so the record
  // stays REFERRED (and open) even though the drugs have been handed over.
  const referred = walkIn.stage === 'REFERRED';
  await prisma.walkIn.update({
    where: { id: walkInId },
    data: referred ? {} : { stage: 'DISPENSED', closedAt: new Date() },
  });

  return { shortages, stage: referred ? 'REFERRED' : 'DISPENSED' };
}

export async function transitionStage(walkInId: string, to: WalkInStage) {
  const walkIn = await prisma.walkIn.findUnique({ where: { id: walkInId }, select: { stage: true } });
  if (!walkIn) throw ApiError.notFound('Walk-in not found');
  if (!canTransition(walkIn.stage as WalkInStage, to)) {
    throw ApiError.unprocessable(`Cannot move a walk-in from ${walkIn.stage} to ${to}`);
  }
  return prisma.walkIn.update({
    where: { id: walkInId },
    data: { stage: to, closedAt: to === 'CLOSED' ? new Date() : undefined },
  });
}
