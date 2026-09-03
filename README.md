# Mass Gathering Health Management System (MGMS)

Software for running health services at a mass gathering: an administration
console for the state, a live GIS and surveillance dashboard for every level
from supervisor upwards, and an offline-first field app for recording walk-ins
at temporary medical camps.

**Try it in a browser** — no install, no account:

| | |
|---|---|
| **Console and dashboard** | `https://<owner>.github.io/<repo>/console/` |
| **Field app** (best on a phone) | `https://<owner>.github.io/<repo>/camp/` |
| **The real stack** | [Open in Codespaces](https://github.com/codespaces/new) |

The published site is a *demonstration*: GitHub Pages has no server, so both
apps carry a snapshot of the seeded gathering and compute everything — including
the outbreak detection — in your browser, using the same shared code the API
runs. Codespaces runs the genuine article, database and all.
[`docs/demo.md`](docs/demo.md) explains exactly what is and is not real.

The field form implements the *Onsite Medical Camp Data Collection* specification
— its nine questions, its validation rules, its auto-captured provenance, and its
three-part split between a volunteer, a paramedic and a medical officer.

---

## What is here

| Path | What it is |
|---|---|
| `packages/shared` | The domain: RBAC, masters, the IDSP syndrome classifier, triage, treatment protocols, and the surveillance algorithms. Shared verbatim by the API and both clients. |
| `services/api` | Express + Prisma + PostgreSQL. Auth, admin, the clinical workflow, offline sync, dashboard aggregation and the scheduled surveillance pass. |
| `apps/web` | React console: admin surfaces and the live dashboard. |
| `apps/mobile` | Installable offline-first PWA used at the camp. |
| `packages/demo` | An in-browser stand-in for the API, so both apps can be published as a static demonstration. |
| `site/` | The demonstration landing page. |
| `docs/` | Architecture, data model, API reference, RBAC, the form mapping, testing and deployment. |

## Running it locally

Prerequisites: Node 22+ and PostgreSQL 16 (or Docker).

```bash
npm install
npm run build --workspace @mgms/shared

# Point the API at a database
cp services/api/.env.example services/api/.env
$EDITOR services/api/.env

npm run db:migrate       # apply migrations
npm run db:seed          # ten days of a demonstration gathering
npm run dev:api          # http://localhost:4000
npm run dev:web          # http://localhost:5173  — console
npm run dev:mobile       # http://localhost:5174  — field app
```

The seed builds a complete worked example: the Karthigai Deepam festival at
Tiruvannamalai across three districts, a zoned festival area, eight camps, staff
for every role, and around 1,700 walk-ins over ten days — including a planted
waterborne diarrhoea outbreak in one sector, so the detectors have something
real to find. Run `npm run analytics:run --workspace @mgms/api` after seeding to
populate the alerts immediately.

Sign in as `state.admin` / `ChangeMe@2026`. Other useful accounts: `district.tvm`
(one district), `girin1.sup` (a camp supervisor), `girin1.mo` (a medical
officer), `girin1.vol1` (a volunteer). Every account uses the same seed password.

### With Docker

```bash
cp .env.example .env
$EDITOR .env                    # set the two JWT secrets
docker compose up --build
```

Console on `:8080`, field app on `:8081`, API on `:4000`.

## Tests

```bash
npm run test:unit     # 30 domain tests — no infrastructure
npm run test:api      # 57 integration tests against a real PostgreSQL
npm run test:e2e      # 52 end-to-end checks against a running stack
npm run typecheck     # every workspace
```

The domain tests cover the syndrome classifier, triage scoring and every
surveillance algorithm against known inputs. The API tests run against a real
database and cover authentication, permission and scope enforcement, the form's
validation rules, the staged clinical workflow, stock movement, offline sync
semantics and aberration detection. The end-to-end checks walk one patient
through the full clinical pathway with three people signing in, and drive the
field app in a real browser with the network pulled out mid-consultation.

**[`docs/testing.md`](docs/testing.md) is the full guide**, including what to
click through by hand to satisfy yourself the thing works.

## The three interfaces

**Admin console** — roles and the permission matrix on one auditable screen,
users (creatable only inside the creator's own area and only for roles their own
role may manage), the three address hierarchies over one village tree,
facilities, the clinical and logistics masters, and events with their zones.

**Live dashboard** — coordinated views over a single filter. Clicking a syndrome
bar, a day on the time series, a camp row or a camp on the map narrows every
panel at once. Surveillance signals, spatial clusters and stock projections sit
alongside the raw counts, each showing the evidence behind it.

**Field app** — the walk-in form, installable, working entirely offline. Every
action is written to a local outbox before the network is attempted, so a camp
keeps working through an outage and no record is lost. Classification and triage
run on the device, so a bite or a hypotensive reading surfaces "call 108" during
the consultation rather than after it reaches a server.

## Where to read next

- [`docs/demo.md`](docs/demo.md) — the browser demonstration and Codespaces, and what each does not cover
- [`docs/testing.md`](docs/testing.md) — how to verify all of this, automated and by hand
- [`docs/architecture.md`](docs/architecture.md) — how the parts fit and why
- [`docs/field-form.md`](docs/field-form.md) — every question in the specification, and where it lives
- [`docs/rbac.md`](docs/rbac.md) — the ten roles, their permissions and how data scope is enforced
- [`docs/data-model.md`](docs/data-model.md) — the schema and the decisions behind it
- [`docs/api.md`](docs/api.md) — endpoint reference
- [`docs/surveillance.md`](docs/surveillance.md) — the detection algorithms and how to read their output
- [`docs/deployment.md`](docs/deployment.md) — running this for a real gathering

## Acknowledgements

The dashboard's coordinated-views design follows
[mgviz-dc](https://github.com/spalladino/mgviz-dc), the participatory
surveillance prototype from EpiHack Rio 2015 — its symptom and syndrome
crossfilter, demographics, time series, map and export are all present here,
rebuilt against a live API.

Syndrome case definitions follow the IDSP syndromic surveillance categories
published by the National Centre for Disease Control, Government of India.
