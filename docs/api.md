# API reference

Base path `/api`. Everything except `/api/auth/login`, `/api/auth/refresh`,
`/health` and `/health/ready` requires `Authorization: Bearer <access token>`.

Errors are `{ "error": { "code": "...", "message": "...", "details": ... } }`.
Validation failures return 400 with per-field issues.

Every listed endpoint is additionally filtered by the caller's data scope; a
permission is necessary but not sufficient.

## Authentication

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ username, password, deviceId? }` → access token, refresh token, user |
| POST | `/auth/refresh` | Rotates single-use; the presented token is revoked |
| POST | `/auth/logout` | Revokes the refresh token |
| GET | `/auth/me` | The caller, with permissions, scope and resolved assignment names |
| POST | `/auth/change-password` | Revokes every other session |

## Admin console

| Method | Path | Permission |
|---|---|---|
| GET | `/roles` | `role.read` |
| GET | `/roles/matrix` | `role.read` — the full role × permission matrix |
| GET | `/roles/permissions` | `role.read` — the catalogue, grouped by module |
| POST · PATCH | `/roles` · `/roles/:id` | `role.write` — built-in permission sets are immutable |
| GET | `/users` | `user.read` — scoped to the caller's area |
| POST · PATCH | `/users` · `/users/:id` | `user.write` — role and assignment both bounded by the caller |
| POST | `/users/:id/reset-password` | `user.reset_password` |
| GET · POST | `/departments` | `master.read` / `master.write` |
| GET | `/address` | `address.read` — `?roots`, `?parentId`, `?level`, `?hierarchy`, `?search` |
| GET | `/address/:id/ancestors` | `address.read` — the breadcrumb chain |
| POST · PATCH | `/address` · `/address/:id` | `address.write` — parent levels validated per hierarchy |
| POST | `/address/:id/move` | `address.write` — re-parents and rewrites descendant paths |
| GET · POST · PATCH | `/facilities` | `facility.read` / `facility.write` |
| GET | `/masters/symptoms` · `/masters/syndromes` · `/masters/drugs` · `/masters/equipment` | `master.read` |
| PATCH | `/masters/symptoms/:id` | `master.write` |
| POST | `/masters/drugs` | `master.write` |

## Events and camps

| Method | Path | Permission |
|---|---|---|
| GET · POST | `/events` | `event.read` / `event.write` |
| GET · POST | `/events/:id/zones` | `event.read` / `event.write` |
| GET · POST · PATCH | `/camps` | `camp.read` / `camp.write` |
| GET · POST | `/camps/:id/roster` | `roster.read` / `roster.write` |
| POST | `/camps/roster/:entryId/attendance` | `roster.write` |
| GET · POST | `/camps/:id/readiness` | `readiness.read` / `readiness.write` |
| GET | `/camps/:id/inventory` | `inventory.read` — includes the stockout projection |
| POST | `/camps/:id/inventory/transactions` | `inventory.write` — refuses to go negative |

## The walk-in workflow

| Method | Path | Permission | Leg |
|---|---|---|---|
| GET | `/walk-ins` | `walkin.read` | `?campId`, `?stage`, `?triageLevel`, `?syndromeCode`, `?waiting`, `?search`, `?from`, `?to` |
| GET | `/walk-ins/:id` | `walkin.read` | Full record plus sample and treatment suggestions |
| POST | `/walk-ins` | `walkin.register` | Screens 1–9. Idempotent on `capture.instanceId` |
| POST | `/walk-ins/:id/vitals` | `walkin.vitals` | Screen 10. Recomputes triage |
| POST | `/walk-ins/:id/clinical` | `walkin.clinical` | Screens 11–13 |
| POST | `/walk-ins/:id/dispense` | `walkin.dispense` | Moves stock; reports shortages |
| POST | `/walk-ins/:id/stage` | `walkin.clinical` | Explicit transition, validated against the stage machine |
| GET | `/walk-ins/export/csv` | `walkin.export` | Line listing; audited |

A registration replayed with the same `instanceId` returns 200 with
`duplicate: true` and the original id, not a second patient.

## Offline sync

| Method | Path | Permission |
|---|---|---|
| POST | `/sync/push` | `sync.push` — a batch of up to 200 operations |
| GET | `/sync/pull?campId=` | `sync.pull` — the offline reference bundle |

`push` returns **207** with a per-operation result: `APPLIED`, `DUPLICATE`,
`CONFLICT` or `REJECTED`. One bad operation never fails the batch. A dependent
operation may reference a registration in the same batch by its `clientId`; the
server resolves it.

The pull bundle carries the camp, its symptom and syndrome masters, the drug
master, the camp's own inventory, the event's zones, the camp district's address
subtree, the referral network and the current waiting list — everything needed to
work with no connection.

## Dashboard and alerts

| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard` | `dashboard.view` — the whole snapshot in one round trip |
| GET | `/dashboard/bounds` | `dashboard.view` — map bounds for the current filter |
| POST | `/dashboard/analytics/run` | `analytics.run` — an out-of-band surveillance pass |
| GET | `/alerts` | `alert.read` — `?severity`, `?type`, `?acknowledged`, `?eventId` |
| POST | `/alerts/:id/acknowledge` | `alert.acknowledge` |

`/dashboard` accepts `eventId`, and comma-separated `campIds`, `districtIds`,
`zoneIds`, `syndromeCodes`, `symptomCodes`, `genders`, `ageBands`,
`triageLevels`, `residenceTypes`, plus `from` and `to`. It returns KPIs, every
categorical breakdown, the time series, geographic counts, camp status,
surveillance signals, spatial clusters and stock projections — one filter, one
response, so no two panels can disagree.

## Health

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness — process is up |
| GET | `/health/ready` | Readiness — the database answers; 503 if not |
