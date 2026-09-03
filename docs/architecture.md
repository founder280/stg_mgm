# Architecture

## Shape

```
                     ┌──────────────────────────────┐
   camp tablet  ───► │  apps/mobile (PWA)           │
                     │  IndexedDB outbox + SW shell │
                     └──────────────┬───────────────┘
                                    │ /api/sync/push · /api/sync/pull
                                    ▼
  officer browser ──►┌──────────────────────────────┐
                     │  services/api                │
                     │  Express · Prisma · JWT      │
                     │  scheduled surveillance pass │
                     └──────────────┬───────────────┘
                                    │
                     ┌──────────────▼───────────────┐
                     │  PostgreSQL                  │
                     └──────────────────────────────┘
          ▲
          │ /api/dashboard · /api/alerts · admin
  ┌───────┴──────────────────────────┐
  │  apps/web (React console)        │
  └──────────────────────────────────┘

  packages/shared — imported by all three, so a rule exists once
```

## Why the domain lives in a shared package

The classifier, the triage score and the form's validation rules are needed in
three places at once: the field app must show the medical officer what a record
will be classified as *before* it is forwarded, the API must not trust a client's
classification, and the console must render the same labels. Duplicating those
rules across three codebases is how a field app and a dashboard end up
disagreeing about what a case is.

So `@mgms/shared` holds the rules, and the API re-derives every classification
server-side from the raw symptoms. The client's copy is for the clinician's
benefit; the server's copy is the record.

## Offline is the design centre, not a fallback

A temporary camp on a girivalam path has intermittent connectivity at best. The
field app therefore never treats the network as available:

1. Every action is written to an IndexedDB outbox and the local walk-in store
   **before** any request is attempted. The record is durable before the tap
   returns.
2. The outbox is flushed in queued order when a connection appears. Order
   matters — a registration must reach the server before the vitals that
   reference it — and the server resolves intra-batch references by client id.
3. Idempotency is keyed on the device-generated `instanceId` from the form's own
   capture metadata. Replaying a batch after a dropped connection cannot create
   a duplicate patient.
4. A rejected record stays on the device, visible, for a human to resolve.
   Silently dropping a patient record is never acceptable.

The service worker precaches the app shell, and a reference bundle (masters, the
camp's district address subtree, its own stock, the referral network) is stored
locally, so a device that is rebooted mid-shift with no signal comes back fully
functional.

## Scope enforcement

A user's visibility is the subtree of their assignments. Two decisions matter:

- **Expansion happens once, at login.** A region assignment is expanded to its
  districts and carried in the access token, because operational rows carry a
  `districtId`, not a `regionId`. The hot query path is then a single indexed
  `IN`, not a recursive walk.
- **Scope is ANDed with the user's filter, never substituted for it.** A district
  officer who explicitly asks for another district's camp gets an empty result,
  not that camp. Widening a filter can never widen visibility.

An unassigned non-state user sees nothing. That is the safe default: the
alternative — an unassigned user falling through to "everything" — is the
classic way a scoped system leaks.

## The surveillance pass

A scheduled job (default every ten minutes) runs four independent analyses and
writes their conclusions as de-duplicated alerts: syndrome aberration per camp
and per district, spatial clustering across festival zones, drug stockout
projection, and operational checks for stale sync and camp readiness.

Alerts carry their evidence — the detector statistics, the cluster geometry, the
stock projection — so the dashboard can explain *why* something fired rather
than just that it did. An officer who cannot see the reasoning will not act on
the alert.

Alerts are keyed on a stable `dedupeKey`, so a condition that persists updates
one row rather than generating a new alert every ten minutes. An acknowledged
alert stays acknowledged while the condition holds, and reopens only if the
severity increases.

## Choices worth explaining

**No tile basemap.** The dashboard map is a projected vector scene drawn from
the API's own coordinates. These deployments sit behind a government firewall
with no route to a tile CDN, and a map that renders blank in a control room is
worse than no map.

**A PWA rather than a native app.** One codebase, installable to a home screen,
updatable without an app-store review in the middle of a festival, and usable on
whatever mixed fleet of tablets a district actually has. The offline guarantees
come from the outbox and the service worker, not from being native.

**Rule-based clinical decision support, not a model.** Triage scoring and
syndrome classification are transparent rules, and every point of the triage
score carries a reason string that is shown to the medical officer and stored
with the record. A medical officer will not — and should not — act on a number
they cannot interrogate. The machine-learning content of this system is in the
surveillance layer, where the question is statistical rather than clinical.

**Syndrome definitions stored as data.** Case definitions live in the database
as declarative rule trees, so IDSP guidance can be revised, versioned and
audited without a code release mid-gathering.
