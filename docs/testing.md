# How to test this

> Looking to just *look* at it? The published demonstration and the Codespaces
> path are in [`docs/demo.md`](demo.md) — no install required. This page is
> about verifying it.

Four layers, cheapest first. The first two need nothing but a database; the
last two need the stack running.

| Layer | Command | Needs |
|---|---|---|
| Domain unit tests | `npm run test:unit` | nothing |
| API integration tests | `npm run test:api` | PostgreSQL |
| End-to-end checks | `npm run test:e2e` | the stack running |
| By hand | see below | the stack running |

---

## 1. Domain unit tests — 30 tests, about a second

```bash
npm install
npm run build --workspace @mgms/shared
npm run test:unit
```

Covers the pure logic with no infrastructure: the IDSP syndrome classifier
against known symptom combinations, triage scoring and its escalation rules,
BMI and blood-pressure derivation, and every surveillance algorithm — EARS
C1/C2/C3, EWMA, CUSUM, DBSCAN, the spatial scan statistic and the stockout
forecast.

These are the tests to read first if you want to know whether the *clinical and
statistical reasoning* is right, separate from any plumbing. Each asserts a
property you can check by hand: a sharp spike alarms, a steady series does not,
a slow climb is caught by EWMA but correctly missed by a single-day test.

## 2. API integration tests — 57 tests, about fifteen seconds

Needs a PostgreSQL you can write to. The suite creates and migrates its own
database (`mgms_test`) and truncates between files, so it never touches your
development data.

```bash
createdb -U mgms mgms_test         # once
npm run test:api
```

Point it elsewhere with `DATABASE_URL` if your database is not on
`localhost:5432` — an externally supplied value always wins over
`services/api/.env.test`. Because it wins, the suite refuses to start unless
the database names itself a test database (ending in `_test` or `_e2e`):
truncation is unconditional, and a development `DATABASE_URL` left exported in
a shell would otherwise take your seeded gathering with it.

Covers, against a real database and a real HTTP surface:

- **auth** — lockout after repeated failures, indistinguishable responses for a
  wrong password and a missing user, single-use refresh rotation, session
  revocation on password change
- **permissions and scope** — a volunteer blocked from vitals, a district user
  seeing exactly their district, an unassigned user seeing nothing, a filter
  that cannot widen visibility, and the rule that a district officer cannot
  mint a state administrator
- **the form's rules** — name normalisation and rejection, the 1–150 year age
  range, a newborn's age in days, mobile normalisation, unknown symptom codes
- **the workflow** — the three legs in sequence, derived vitals, stock moving
  only on dispensing, a refused issue when stock is short, and a referred
  patient staying referred after their drugs are handed over
- **sync** — idempotency, intra-batch references, one bad operation not failing
  a batch, scope enforcement on push and pull
- **surveillance** — a planted outbreak detected at the camp that has it, a
  steady syndrome correctly ignored, alerts de-duplicated across passes, and an
  acknowledged alert staying acknowledged

## 3. End-to-end checks — 52 checks

These exercise what unit tests cannot: real tokens over real HTTP, and a real
browser going offline.

### Start the stack

```bash
cp services/api/.env.example services/api/.env   # then edit it
npm run build --workspace @mgms/shared
npm run db:migrate
npm run db:seed            # ten days of a demonstration gathering
npm run analytics:run      # populate the alerts immediately

npm run dev:api            # :4000
npm run dev:web            # :5173  — console
npm run preview:mobile     # :5175  — field app, production build
```

The field app is previewed rather than run in dev because the **service worker
is only registered in a production build**, and that is what makes the offline
restart work. Against the dev server on `:5174` everything else still passes and
that one check reports itself as skipped.

### Run them

```bash
npm run test:e2e
```

Or individually:

```bash
node e2e/api-workflow.mjs
MGMS_FIELD_URL=http://localhost:5175 node e2e/field-app-offline.mjs
```

The browser checks need Playwright:

```bash
npm install -D playwright && npx playwright install chromium
```

If your environment already ships a Chromium, point at it with
`PLAYWRIGHT_CHROMIUM_PATH` instead of downloading another.

**`e2e/api-workflow.mjs`** walks one patient through the whole clinical
pathway with three different people signing in — a volunteer registers, is
refused vitals, a paramedic records measurements that escalate the triage to
red, a medical officer prescribes and refers, stock moves on dispensing — then
checks sync, scope isolation between camps and districts, session rotation, and
that the seeded outbreak is detected.

**`e2e/field-app-offline.mjs`** drives the field app in a mobile browser and
pulls the network out mid-consultation: register online, go offline, record
vitals, register a second patient with no connection, restart the app still
offline, reconnect — refusing the first push, as a real link often does — and
confirm the app retries on its own until every queued record flushes and
receives a server token. This is the property the whole field design rests on.

Override any endpoint with `MGMS_API_URL`, `MGMS_WEB_URL`, `MGMS_FIELD_URL` or
`MGMS_SEED_PASSWORD`.

## 4. By hand

With the stack running and seeded. Every account uses the seed password
`ChangeMe@2026`.

### The dashboard reports what is actually happening

Sign in to the console at `:5173` as **`state.admin`**.

- The **Surveillance signals** panel should name *Acute Diarrhoeal Disease* at
  *Jatara North Medical Camp*, roughly 30 observed against under 2 expected,
  flagged by several detectors. That is the outbreak the seed plants, found
  rather than announced.
- Open **Alerts** and press *Evidence* on that alert — each detector's
  statistic, threshold and expected value. An alert you cannot interrogate is an
  alert nobody acts on.
- Click that syndrome's bar under **Syndrome**. Every panel narrows: the map,
  the time series, the camp table. Click a day on the time series to pin it too.
- On the map, the same sector carries the largest circles and a cluster ring.
  Two independent methods — a temporal detector and a spatial scan — agreeing on
  one sector is the thing to look for.

### Scope actually holds

- Sign in as **`district.mulugu`** — eight camps, all Mulugu.
- Sign in as **`district.bhupalpally`** — none of them.
- As `district.bhupalpally`, try a Mulugu camp id in the URL. Empty, not an
  error page and not the data.
- Sign in as **`jatn1.sup`** (supervisor): the dashboard is there, *Roles &
  permissions* is not in the navigation.
- Open **Roles & permissions** as `state.admin` for the full matrix on one
  screen — ten roles by thirty-six permissions.

### The field app works with the network off

Open the field app at `:5175` on a phone, or in desktop devtools with device
emulation. Sign in as **`jatn1.vol1`** (volunteer).

1. Register a walk-in. Try typing digits into the name — they will not appear.
   Use the on-screen keypad for the mobile number.
2. On the last step, tick **Fever** and **Bleeding from gums**. Before you
   forward it, the app names the syndrome (*Acute Haemorrhagic Fever Syndrome*)
   and cites IDSP. Classification happens on the device, not after the fact.
3. **Turn on airplane mode**, or tick *Offline* in the devtools network panel.
   The header changes to Offline.
4. Keep working. Register more patients. Nothing blocks.
5. Reload the page while still offline. It comes back, still signed in, with
   your records intact — that is the service worker and IndexedDB.
6. Turn the network back on. The pending counter drains and each record gains a
   token number from the server.
7. Sign in to the console and find those patients under **Walk-ins**.

### The split form is really split

- As `jatn1.vol1` (volunteer), you can register but the vitals screen refuses.
- Sign in as `jatn1.para` (paramedic) and open the same patient from
  **Waiting** — vitals are available.
- Sign in as `jatn1.mo` (medical officer) — investigations and treatment.
- The drug list offers only what that camp holds. Check the camp's stock in the
  console before and after dispensing.

### Nothing is silently lost

The strongest single check: register a patient with the network off, then close
the browser entirely before reconnecting. Reopen it, go online, and the record
still arrives. If that holds, the outbox is doing its job.

## Continuous integration

`.github/workflows/ci.yml` runs the type check, both test suites against a
PostgreSQL service container, and builds all three applications and their
container images on every push and pull request. The API tests run against the
same migrations production applies, so a broken migration fails the pipeline
rather than a deployment.

## Known gaps

- The **container images are unverified** in the sandbox this was built in — its
  proxy blocks the container registry. CI builds all three; that is where they
  are first exercised.
- The end-to-end checks assume the demonstration seed. Against a real database
  they will fail on the account names, not on behaviour.
- There is no load test. Before a gathering at real scale, rehearse the
  reconnection spike described in `docs/deployment.md`: a whole camp's queued
  day arriving at once is the load shape that matters, not the steady state.
