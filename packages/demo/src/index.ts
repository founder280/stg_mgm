import {
  EQUIPMENT_MASTER,
  FORM_NAME,
  FORM_VERSION,
  ageBand,
  ageInMonths,
  classifySyndromes,
  moduleOf,
  scoreTriage,
  suggestSamples,
  suggestTreatment,
  ALL_PERMISSIONS,
  type DashboardFilter,
} from '@mgms/shared';
import { buildDemoSnapshot, computeStock, filterWalkIns } from './dashboard.js';
import {
  campById,
  permissionsFor,
  resetState,
  roleByCode,
  scopeFor,
  snapshot,
  state,
  visibleCamps,
  visibleWalkIns,
  type DemoUser,
  type DemoWalkIn,
} from './store.js';

export { resetState, snapshot };

/**
 * An in-browser stand-in for the API, for the published demonstration.
 *
 * GitHub Pages serves static files, so there is no Node process and no
 * database. This implements the endpoints the console and the field app
 * actually call, over the seeded dataset — and delegates every piece of
 * judgement (syndrome classification, triage, aberration detection, the
 * spatial scan, stockout projection) to the same `@mgms/shared` code the real
 * server runs. What you see the demo conclude is what the server concludes.
 *
 * What is *not* real here: persistence (a reload resets anything you create),
 * password checking (any password is accepted for a seeded username), and
 * SQL-side aggregation, which is done in JavaScript instead.
 */

export interface DemoResponse {
  status: number;
  body: unknown;
}

const ok = (body: unknown): DemoResponse => ({ status: 200, body });
const created = (body: unknown): DemoResponse => ({ status: 201, body });
const fail = (status: number, code: string, message: string): DemoResponse => ({
  status,
  body: { error: { code, message } },
});

/** Session state for the page's lifetime. */
let signedIn: DemoUser | null = null;

function sessionPayload(user: DemoUser) {
  const role = roleByCode.get(user.roleCode);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roleCode: user.roleCode,
    roleName: role?.name ?? user.roleCode,
    scopeLevel: role?.scopeLevel ?? 'CAMP',
    permissions: permissionsFor(user),
    scope: scopeFor(user),
  };
}

function requireSession(): DemoUser | null {
  return signedIn;
}

function csv(rows: DemoWalkIn[]): string {
  const headers = ['token', 'registered_at', 'camp', 'age_years', 'age_band', 'gender', 'symptoms', 'primary_syndrome', 'triage', 'stage'];
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.tokenNumber,
        row.registeredAt,
        campById.get(row.campId)?.name ?? '',
        row.ageYears,
        row.ageBand,
        row.gender,
        row.symptoms.map((s) => s.symptomCode).join('|'),
        row.primarySyndromeCode ?? '',
        row.triageLevel,
        row.stage,
      ]
        .map(escape)
        .join(','),
    ),
  ].join('\n');
}

function parseFilter(params: URLSearchParams): DashboardFilter {
  const list = (key: string) => {
    const value = params.get(key);
    return value ? value.split(',').filter(Boolean) : undefined;
  };
  return {
    eventId: params.get('eventId') ?? undefined,
    campIds: list('campIds'),
    districtIds: list('districtIds'),
    zoneIds: list('zoneIds'),
    syndromeCodes: list('syndromeCodes'),
    symptomCodes: list('symptomCodes'),
    genders: list('genders'),
    ageBands: list('ageBands'),
    triageLevels: list('triageLevels') as never,
    residenceTypes: list('residenceTypes'),
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  };
}

/** Route one request. `path` is everything after `/api`. */
// eslint-disable-next-line complexity
export async function handleDemoRequest(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<DemoResponse> {
  const method = (options.method ?? 'GET').toUpperCase();
  const [rawPath = '', query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  const segments = rawPath.replace(/^\/+|\/+$/g, '').split('/');
  const body = (options.body ?? {}) as Record<string, unknown>;

  // --- auth ---------------------------------------------------------------
  if (segments[0] === 'auth') {
    if (segments[1] === 'login' && method === 'POST') {
      const username = String(body.username ?? '').trim();
      const user = state.users.find((u) => u.username === username);
      if (!user) {
        return fail(401, 'UNAUTHORIZED', 'No such demonstration account. Try state.admin, district.mulugu or jatn1.vol1.');
      }
      signedIn = user;
      return ok({
        accessToken: `demo.${user.id}`,
        refreshToken: `demo-refresh.${user.id}`,
        expiresIn: '30m',
        user: sessionPayload(user),
      });
    }

    if (segments[1] === 'refresh' && method === 'POST') {
      const token = String(body.refreshToken ?? '');
      const user = state.users.find((u) => token.endsWith(u.id));
      if (!user) return fail(401, 'UNAUTHORIZED', 'Sign in again');
      signedIn = user;
      return ok({
        accessToken: `demo.${user.id}`,
        refreshToken: `demo-refresh.${user.id}`,
        expiresIn: '30m',
        user: sessionPayload(user),
      });
    }

    if (segments[1] === 'logout') {
      signedIn = null;
      return { status: 204, body: null };
    }

    if (segments[1] === 'me') {
      const user = requireSession();
      if (!user) return fail(401, 'UNAUTHORIZED', 'Sign in first');
      const assignments = user.assignments.map((a) =>
        a.scopeType === 'CAMP'
          ? { type: 'CAMP', id: a.scopeId, name: campById.get(a.scopeId)?.name ?? 'Camp' }
          : { type: a.scopeType, id: a.scopeId, name: snapshot.addressUnits.find((u) => u.id === a.scopeId)?.name ?? a.scopeType },
      );
      return ok({ ...sessionPayload(user), designation: user.designation, email: user.email, department: user.department ? { id: 'demo', name: user.department } : null, assignments });
    }

    if (segments[1] === 'change-password') {
      return fail(403, 'FORBIDDEN', 'Passwords cannot be changed in the demonstration — it has no database.');
    }
  }

  const user = requireSession();
  if (!user) return fail(401, 'UNAUTHORIZED', 'Sign in first');
  const scope = scopeFor(user);
  const permissions = permissionsFor(user);

  const deny = (permission: string) =>
    permissions.includes(permission as never)
      ? null
      : fail(403, 'FORBIDDEN', `Your role (${user.roleCode}) is missing: ${permission}`);

  // --- events and camps ---------------------------------------------------
  if (segments[0] === 'events') {
    const refused = deny('event.read');
    if (refused) return refused;

    if (segments.length === 1) {
      return ok({
        items: [
          {
            ...snapshot.event,
            campCount: snapshot.camps.length,
            walkInCount: state.walkIns.length,
          },
        ],
      });
    }
    if (segments[2] === 'zones') return ok({ items: snapshot.zones });
  }

  if (segments[0] === 'camps') {
    const refused = deny('camp.read');
    if (refused) return refused;

    if (segments.length === 1) {
      let camps = visibleCamps(scope);
      if (params.get('activeOnly') === 'true') camps = camps.filter((c) => c.isActive);
      if (params.get('districtId')) camps = camps.filter((c) => c.districtId === params.get('districtId'));
      return ok({
        items: camps.map((camp) => ({
          ...camp,
          event: { id: snapshot.event.id, name: snapshot.event.name },
          _count: { walkIns: state.walkIns.filter((w) => w.campId === camp.id).length },
        })),
      });
    }

    const campId = segments[1]!;
    const camp = campById.get(campId);
    if (!camp) return fail(404, 'NOT_FOUND', 'Camp not found');
    if (scope.level !== 'STATE' && !scope.campIds.includes(campId) && !scope.districtIds.includes(camp.districtId)) {
      return fail(403, 'FORBIDDEN', 'This camp is outside your assigned area');
    }

    if (segments[2] === 'inventory') {
      const projections = new Map(computeStock([campId]).map((p) => [p.drugCode, p]));
      return ok({
        items: state.inventory
          .filter((row) => row.campId === campId)
          .map((row) => ({
            id: `${row.campId}-${row.drugId}`,
            drugId: row.drugId,
            drugCode: row.drug.code,
            drugName: row.drug.name,
            form: row.drug.form,
            strength: row.drug.strength,
            emergencyTray: row.drug.emergencyTray,
            onHand: row.onHand,
            reorderLevel: row.drug.reorderLevel,
            batchNumber: row.batchNumber,
            expiryDate: null,
            projection: projections.get(row.drug.code) ?? null,
          })),
      });
    }

    if (segments[2] === 'readiness') {
      return ok({ items: camp.readiness ? [camp.readiness] : [] });
    }
  }

  // --- walk-ins -----------------------------------------------------------
  if (segments[0] === 'walk-ins') {
    const refused = deny('walkin.read');
    if (refused) return refused;

    if (segments[1] === 'export' && segments[2] === 'csv') {
      return ok(csv(visibleWalkIns(scope)));
    }

    if (segments.length === 1) {
      let rows = visibleWalkIns(scope);
      const search = params.get('search')?.toLowerCase();
      if (params.get('campId')) rows = rows.filter((w) => w.campId === params.get('campId'));
      if (params.get('stage')) rows = rows.filter((w) => w.stage === params.get('stage'));
      if (params.get('triageLevel')) rows = rows.filter((w) => w.triageLevel === params.get('triageLevel'));
      if (params.get('syndromeCode')) rows = rows.filter((w) => w.primarySyndromeCode === params.get('syndromeCode'));
      if (params.get('waiting') === 'true') rows = rows.filter((w) => w.stage === 'REGISTERED' || w.stage === 'VITALS_DONE');
      if (search) rows = rows.filter((w) => w.name.toLowerCase().includes(search) || w.tokenNumber.toLowerCase().includes(search));

      const rank: Record<string, number> = { RED: 0, ORANGE: 1, YELLOW: 2, GREEN: 3 };
      rows = [...rows].sort((a, b) => (rank[a.triageLevel] ?? 3) - (rank[b.triageLevel] ?? 3));

      const page = Number(params.get('page') ?? 1);
      const pageSize = Number(params.get('pageSize') ?? 50);
      return ok({
        items: rows.slice((page - 1) * pageSize, page * pageSize).map((row) => ({
          ...row,
          camp: { id: row.campId, name: campById.get(row.campId)?.name ?? 'Camp' },
        })),
        page,
        pageSize,
        total: rows.length,
      });
    }

    const walkIn = state.walkIns.find((w) => w.id === segments[1]);
    if (!walkIn) return fail(404, 'NOT_FOUND', 'Walk-in not found');

    const syndromes = classifySyndromes({
      symptoms: Object.fromEntries(walkIn.symptoms.map((s) => [s.symptomCode, s.onsetTotalHours])),
      ageMonths: walkIn.ageYears * 12,
    });
    const campInventory = state.inventory
      .filter((row) => row.campId === walkIn.campId)
      .map((row) => ({ drugCode: row.drug.code, availableQuantity: row.onHand }));

    return ok({
      walkIn: {
        ...walkIn,
        camp: { id: walkIn.campId, name: campById.get(walkIn.campId)?.name ?? 'Camp' },
        syndromes: syndromes.map((s, index) => ({ syndromeCode: s.code, isPrimary: index === 0, reference: s.reference, syndrome: s })),
        symptoms: walkIn.symptoms.map((s) => ({ ...s, symptom: { code: s.symptomCode, name: s.symptomCode } })),
        injuries: [],
        bites: [],
        prescriptionLines: [],
      },
      decisionSupport: {
        suggestedSamples: suggestSamples(syndromes.map((s) => s.code), walkIn.symptoms.map((s) => s.symptomCode)),
        suggestedTreatment: suggestTreatment(syndromes[0]?.code ?? null, campInventory),
      },
    });
  }

  // --- the field app's sync surface ---------------------------------------
  if (segments[0] === 'sync') {
    if (segments[1] === 'pull') {
      const campId = params.get('campId') ?? scope.campIds[0] ?? '';
      const camp = campById.get(campId);
      if (!camp) return fail(404, 'NOT_FOUND', 'Camp not found');

      // Only this camp's district subtree, exactly as the server ships it.
      const districtId = camp.districtId;
      const inSubtree = new Set<string>([districtId]);
      let added = true;
      while (added) {
        added = false;
        for (const unit of snapshot.addressUnits) {
          if (unit.parentId && inSubtree.has(unit.parentId) && !inSubtree.has(unit.id)) {
            inSubtree.add(unit.id);
            added = true;
          }
        }
      }

      return ok({
        generatedAt: new Date().toISOString(),
        camp,
        symptoms: snapshot.symptoms,
        syndromes: snapshot.syndromes,
        drugs: snapshot.drugs,
        inventory: state.inventory
          .filter((row) => row.campId === campId)
          .map((row) => ({ drugId: row.drugId, onHand: row.onHand, batchNumber: row.batchNumber, expiryDate: null, drug: row.drug })),
        zones: snapshot.zones,
        addressUnits: snapshot.addressUnits.filter((unit) => inSubtree.has(unit.id)),
        referralFacilities: snapshot.facilities.filter((f) => f.isEmpanelled || f.type === 'LABORATORY' || f.type === 'AMBULANCE_BASE'),
        waitingList: state.walkIns
          .filter((w) => w.campId === campId && (w.stage === 'REGISTERED' || w.stage === 'VITALS_DONE'))
          .slice(0, 50),
      });
    }

    if (segments[1] === 'push' && method === 'POST') {
      const operations = (body.operations ?? []) as Array<Record<string, unknown>>;
      const results = operations.map((operation) => {
        if (operation.kind !== 'REGISTRATION') {
          const known = operation.walkInId || operation.walkInClientId;
          return known
            ? { clientId: operation.clientId, status: 'APPLIED' }
            : { clientId: operation.clientId, status: 'REJECTED', message: 'The walk-in this record belongs to has not reached the server yet' };
        }

        const payload = operation.payload as Record<string, unknown>;
        const camp = campById.get(String(payload.campId));
        const age = payload.age as { years: number; months: number; days: number };
        const totalMonths = ageInMonths(age.years, age.months, age.days);
        const symptomList = (payload.symptoms ?? []) as Array<{ symptomCode: string; onsetDays: number; onsetHours: number }>;

        const syndromes = classifySyndromes({
          symptoms: Object.fromEntries(symptomList.map((s) => [s.symptomCode, s.onsetDays * 24 + s.onsetHours])),
          ageMonths: totalMonths,
        });
        const triage = scoreTriage({
          symptomCodes: symptomList.map((s) => s.symptomCode),
          caseCategories: (payload.caseCategories ?? []) as never,
          ageMonths: totalMonths,
        });

        const sameDay = state.walkIns.filter(
          (w) => w.campId === camp?.id && w.registeredAt.slice(0, 10) === new Date().toISOString().slice(0, 10),
        ).length;
        const tokenNumber = `${camp?.code ?? 'CAMP'}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(sameDay + 1).padStart(4, '0')}`;

        const walkIn: DemoWalkIn = {
          id: crypto.randomUUID(),
          tokenNumber,
          name: String(payload.name ?? '').toUpperCase(),
          ageYears: age.years,
          ageBand: ageBand(totalMonths),
          gender: String(payload.gender ?? 'MALE'),
          residenceType: String((payload.residence as Record<string, unknown>)?.residenceType ?? 'HOME_STATE'),
          residenceUnitId: ((payload.residence as Record<string, unknown>)?.addressUnitId as string) ?? null,
          stayTotalDays: 1,
          onsetPlace: String(payload.onsetPlace ?? 'FESTIVAL_AREA'),
          onsetZoneId: (payload.onsetZoneId as string) ?? camp?.zoneId ?? null,
          campId: camp?.id ?? '',
          districtId: camp?.districtId ?? '',
          stage: 'REGISTERED',
          triageLevel: triage.level,
          triageScore: triage.score,
          primarySyndromeCode: syndromes[0]?.code ?? null,
          registeredAt: new Date().toISOString(),
          symptoms: symptomList.map((s) => ({ symptomCode: s.symptomCode, onsetTotalHours: s.onsetDays * 24 + s.onsetHours })),
          vitals: null,
        };
        state.walkIns.push(walkIn);

        return { clientId: operation.clientId, status: 'APPLIED', walkInId: walkIn.id, tokenNumber };
      });

      return {
        status: 207,
        body: {
          batchId: crypto.randomUUID(),
          receivedAt: new Date().toISOString(),
          results,
          applied: results.filter((r) => r.status === 'APPLIED').length,
          duplicates: 0,
          rejected: results.filter((r) => r.status === 'REJECTED').length,
        },
      };
    }
  }

  // --- dashboard and alerts -----------------------------------------------
  if (segments[0] === 'dashboard') {
    const refused = deny('dashboard.view');
    if (refused) return refused;
    if (segments[1] === 'analytics') return ok({ eventsScanned: 1, signalsFound: 0, clustersFound: 0, stockAlerts: 0, operationalAlerts: 0 });
    return ok(buildDemoSnapshot(parseFilter(params), scope));
  }

  if (segments[0] === 'alerts') {
    const refused = deny('alert.read');
    if (refused) return refused;

    if (segments.length >= 2 && segments[2] === 'acknowledge') {
      const alert = state.alerts.find((a) => a.id === segments[1]);
      if (alert) {
        alert.acknowledgedAt = new Date().toISOString();
        (alert as Record<string, unknown>).acknowledgedByName = user.fullName;
      }
      return ok({ id: segments[1], acknowledgedAt: alert?.acknowledgedAt ?? null });
    }

    let alerts = state.alerts.filter(
      (a) => scope.level === 'STATE' || (!a.campId && !a.districtId) || (a.campId && scope.campIds.includes(a.campId)) || (a.districtId && scope.districtIds.includes(a.districtId)),
    );
    if (params.get('acknowledged') === 'false') alerts = alerts.filter((a) => !a.acknowledgedAt);
    if (params.get('acknowledged') === 'true') alerts = alerts.filter((a) => a.acknowledgedAt);
    if (params.get('type')) alerts = alerts.filter((a) => a.type === params.get('type'));
    if (params.get('severity')) alerts = alerts.filter((a) => a.severity === params.get('severity'));

    return ok({
      items: alerts.map((a) => ({
        ...a,
        campName: a.campId ? campById.get(a.campId)?.name ?? null : null,
        districtName: a.districtId ? campById.get(a.campId ?? '')?.district.name ?? null : null,
      })),
    });
  }

  // --- admin console ------------------------------------------------------
  if (segments[0] === 'roles') {
    const refused = deny('role.read');
    if (refused) return refused;

    if (segments[1] === 'matrix') {
      return ok({
        permissions: ALL_PERMISSIONS.map((code) => ({ code, module: moduleOf(code) })),
        roles: snapshot.roles.map((r) => ({ code: r.code, name: r.name, scopeLevel: r.scopeLevel, permissions: r.permissions })),
      });
    }
    if (segments[1] === 'permissions') {
      const grouped = new Map<string, Array<{ id: string; code: string; description: string | null }>>();
      for (const code of ALL_PERMISSIONS) {
        const module = moduleOf(code);
        const list = grouped.get(module) ?? [];
        list.push({ id: code, code, description: null });
        grouped.set(module, list);
      }
      return ok({ modules: [...grouped.entries()].map(([module, permissionList]) => ({ module, permissions: permissionList })) });
    }
    if (method === 'PATCH') return fail(403, 'FORBIDDEN', 'The demonstration is read-only for roles.');

    return ok({
      items: snapshot.roles.map((role) => ({
        ...role,
        userCount: state.users.filter((u) => u.roleCode === role.code).length,
      })),
    });
  }

  if (segments[0] === 'users') {
    const refused = deny('user.read');
    if (refused) return refused;

    if (method === 'POST') return fail(403, 'FORBIDDEN', 'The demonstration cannot create users — it has no database.');

    const search = params.get('search')?.toLowerCase();
    let users = state.users;
    if (scope.level !== 'STATE') {
      const allowed = new Set([...scope.districtIds, ...scope.campIds]);
      users = users.filter((u) => u.assignments.some((a) => allowed.has(a.scopeId)));
    }
    if (params.get('roleCode')) users = users.filter((u) => u.roleCode === params.get('roleCode'));
    if (search) users = users.filter((u) => u.fullName.toLowerCase().includes(search) || u.username.includes(search));

    return ok({
      items: users.map((u) => ({
        ...u,
        roleName: roleByCode.get(u.roleCode)?.name ?? u.roleCode,
        scopeLevel: roleByCode.get(u.roleCode)?.scopeLevel ?? 'CAMP',
        assignmentCount: u.assignments.length,
      })),
      page: 1,
      pageSize: 100,
      total: users.length,
    });
  }

  if (segments[0] === 'address') {
    const refused = deny('address.read');
    if (refused) return refused;

    const childCount = (id: string) => snapshot.addressUnits.filter((u) => u.parentId === id).length;
    let units = snapshot.addressUnits;

    if (params.get('search')) {
      const needle = params.get('search')!.toLowerCase();
      units = units.filter((u) => u.name.toLowerCase().includes(needle));
    } else if (params.get('roots') === 'true') {
      units = units.filter((u) => !u.parentId && (!params.get('hierarchy') || u.hierarchy === params.get('hierarchy')));
    } else if (params.get('parentId')) {
      units = units.filter((u) => u.parentId === params.get('parentId'));
    } else if (params.get('level')) {
      units = units.filter((u) => u.level === params.get('level'));
    }

    return ok({ items: units.slice(0, 200).map((u) => ({ ...u, childCount: childCount(u.id) })) });
  }

  if (segments[0] === 'facilities') {
    const refused = deny('facility.read');
    if (refused) return refused;

    let facilities = snapshot.facilities.filter((f) => f.isActive);
    if (params.get('type')) facilities = facilities.filter((f) => f.type === params.get('type'));
    if (params.get('speciality')) facilities = facilities.filter((f) => f.specialities.includes(params.get('speciality')!));
    if (params.get('empanelledOnly') === 'true') facilities = facilities.filter((f) => f.isEmpanelled);
    return ok({ items: facilities });
  }

  if (segments[0] === 'masters') {
    const refused = deny('master.read');
    if (refused) return refused;
    if (segments[1] === 'symptoms') return ok({ items: snapshot.symptoms });
    if (segments[1] === 'syndromes') return ok({ items: snapshot.syndromes });
    if (segments[1] === 'drugs') return ok({ items: snapshot.drugs });
    if (segments[1] === 'equipment') return ok({ items: EQUIPMENT_MASTER });
  }

  if (segments[0] === 'departments') return ok({ items: [] });

  return fail(404, 'NOT_FOUND', `The demonstration does not implement ${method} /api/${rawPath}`);
}

/** Handy for a landing page that wants to show what the seed contains. */
export const demoFacts = {
  formName: FORM_NAME,
  formVersion: FORM_VERSION,
  eventName: snapshot.event.name,
  walkIns: snapshot.walkIns.length,
  camps: snapshot.camps.length,
  users: snapshot.users.length,
  generatedAt: snapshot.generatedAt,
};

export { filterWalkIns };
