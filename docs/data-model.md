# Data model

PostgreSQL via Prisma. `services/api/prisma/schema.prisma` is the source of
truth; this describes the shape and the decisions.

## Groups

**Identity** — `Role`, `Permission`, `RolePermission`, `User`, `UserAssignment`,
`RefreshToken`, `Department`, `AuditLog`.

**Geography** — `AddressUnit`, one self-referencing tree carrying all three
hierarchies (administrative, revenue, health), tagged by `hierarchy` and
`level`.

**Infrastructure** — `Facility` (camp sites, PHCs, hospitals, empanelled
hospitals, laboratories, drug warehouses, ambulance bases, control rooms).

**The gathering** — `Event`, `EventDistrict`, `EventZone` (a tree of main
divisions and sub-divisions), `Camp`.

**Camp operations** — `RosterEntry`, `Attendance`, `CampReadiness`,
`ReadinessEquipment`, `CampPhoto`, `Drug`, `CampInventory`, `StockTransaction`.

**Clinical** — `Symptom`, `SyndromeDefinition`, `WalkIn`, `WalkInSymptom`,
`InjuryDetail`, `BiteDetail`, `WalkInSyndrome`, `Vitals`, `ClinicalRecord`,
`LabOrder`, `PrescriptionLine`, `Referral`.

**Platform** — `SyncBatch`, `Alert`.

## Decisions

**Denormalised scope columns.** Every operational row carries `eventId`,
`districtId` and `campId` even where they are derivable. The row-level scope
filter is then one indexed `WHERE` rather than a join walk, on the query that
runs most often.

**Denormalised derived values.** `ageTotalMonths` and `ageBand` on `WalkIn`,
`onsetTotalHours` on `WalkInSymptom`, `bmi` and `bpStage` on `Vitals`. These are
computed once on write. Age-band aggregation across a million walk-ins should not
mean per-row arithmetic in the query.

**Materialised ancestor paths.** `AddressUnit.path` stores the ancestor chain, so
a subtree query is a prefix match rather than a recursive CTE. Re-parenting
rewrites descendant paths in one statement and is a dedicated endpoint, not a
field update, precisely because it is not a local change.

**`instanceId` is unique.** The device-generated instance id from the form's
capture metadata is a unique column on `WalkIn`, `Vitals` and `ClinicalRecord`.
This is what makes offline sync idempotent: the database itself refuses a
duplicate, rather than the application trying to detect one.

**Capture metadata is stored verbatim.** Form name and version, device, login
user and time, and the start and end time of the record. A clinical record made
at a mass gathering is a legal document, and "which version of the form produced
this" is a question that will be asked.

**Signed stock movements.** `StockTransaction.quantity` is signed and
`balanceAfter` is stored, so the ledger reconciles against `CampInventory.onHand`
without replaying history. The API derives the sign from the transaction type, so
a client cannot send a sign that contradicts it. An issue that would take a
balance negative is refused, not clamped — the shelf and the ledger must never
disagree.

**Syndrome definitions as data.** `SyndromeDefinition.rule` is a JSON rule tree
evaluated by the shared engine, versioned by `version`. IDSP guidance changes;
a code release mid-gathering is not an acceptable way to follow it.

**Alerts are de-duplicated by key.** `Alert.dedupeKey` is unique. A condition
that persists across surveillance passes updates one row rather than producing a
new alert every ten minutes.

## Migrations

Migrations live in `services/api/prisma/migrations` and are applied with
`prisma migrate deploy` — in the container's start command, and in CI before the
test suite, so a migration that fails is caught by the pipeline rather than in
production.

The test suite runs against the same migrations rather than `db push`, for the
same reason.

## Retention and privacy

Walk-in records contain identifiable health data. Before a real deployment:

- Set a retention policy for `WalkIn` and its children in line with state health
  department rules, and archive rather than delete where records must be kept.
- The CSV export is permission-gated (`walkin.export`) and audited, but it
  produces identifiable data — restrict that permission to the surveillance
  units that need it.
- Consider encryption at rest for `name`, `mobile` and the free-text clinical
  columns, and confirm that database backups are covered by the same controls as
  the primary.
