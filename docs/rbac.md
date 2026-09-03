# Roles, permissions and data scope

Two independent mechanisms decide what a user can do:

- **Permissions** decide *which actions* — enforced per endpoint.
- **Scope** decides *over which data* — enforced per row.

Both must pass. A district officer holds `camp.write` but only for camps in
their district.

## The ten roles

| Role | Level | What it is for |
|---|---|---|
| State Super User | State | Full platform administrator. Configures roles, users, masters, the address hierarchy and facilities. |
| State Level Officer | State | State-wide operational oversight. Runs events and camps, acknowledges alerts; cannot alter roles or platform masters. |
| Regional Level User | Region | A group of districts. Coordinates camps and referrals across the region. |
| Department Head | Department | Heads a line department (Health, Revenue, Police, Fire, Sanitation) across the state. |
| Department Domain User | Department | Subject-matter user in a department — IDSP surveillance, drug logistics, ambulance control. |
| District Level User | District | District administrator for the gathering. Owns camps, rosters and stock. |
| District Domain User | District | District subject-matter user — DSU-IDSP, district drug store, lab coordinator. |
| Supervisory Staff | Facility | Supervises a set of camps. The lowest level with live dashboard access; marks attendance and readiness. |
| Field Staff | Camp | Paramedic, staff nurse or medical officer. Records vitals and the clinical section. |
| Volunteer | Camp | Registers walk-ins at the entrance (screens 1–9) and hands the record forward. |

The console renders the full role × permission matrix on one screen, which is
the artefact an auditor asks for.

## Permissions

Permissions are `module.action` across seventeen modules: `role`, `user`,
`master`, `address`, `facility`, `event`, `camp`, `roster`, `readiness`,
`inventory`, `walkin`, `referral`, `dashboard`, `alert`, `analytics`, `audit`,
`sync`.

The clinical ones mirror the form's split, so the three legs of a walk-in can be
held by three different people:

- `walkin.register` — screens 1–9
- `walkin.vitals` — screen 10
- `walkin.clinical` — screens 11–13
- `walkin.dispense` — pharmacy issue against the prescription

Built-in roles have fixed permission sets. An administrator who could edit them
could lock every user, including themselves, out of the console; custom roles
are the supported way to vary this.

## Scope

A user holds one or more assignments — a region, a district, a facility or a
camp. Their visibility is the union of those subtrees.

At sign-in, assignments are resolved into concrete id sets and carried in the
access token. A region assignment is expanded to its districts at this point,
because operational rows carry a `districtId`: doing the expansion once keeps
every subsequent query to a single indexed lookup rather than a tree walk.

Three properties this design guarantees:

**Scope is ANDed with the user's filter.** A district officer who explicitly
requests another district's camp gets an empty result rather than that camp.
Widening a filter cannot widen visibility. The dashboard is scoped by exactly
the same predicate as the list endpoints, so the two can never disagree.

**An unassigned non-state user sees nothing.** The scope predicate falls back to
an impossible condition, never to an unfiltered query. The opposite default is
the classic way a scoped system leaks.

**Assignment is checked by containment, not by id equality.** A district officer
staffing a camp inside their district is granting an assignment whose id is not
itself in their scope; the check resolves the camp and asks whether it sits
inside their area. Role creation is bounded the same way — each role declares
which roles it may manage, so a district officer cannot mint a state
administrator.

## Audit

Every administrative and clinical action writes an append-only `AuditLog` entry
with the actor, the entity, a before/after payload where relevant, the IP and
the user agent. Audit writes never roll back the action they describe — a failed
audit is logged, not propagated.

Request logs redact authorization headers, cookies, passwords, refresh tokens
and patient names.

## Sessions

Argon2id password hashes. Five failed sign-ins lock an account for fifteen
minutes, and a locked account is refused even with the correct password. A
missing username and a wrong password return the same message and spend the same
work, so the endpoint does not enumerate users.

Access tokens are short-lived and held in memory by both clients — never in
`localStorage`, where any script on the page can read them. Refresh tokens are
single-use: presenting one immediately revokes it and issues a new pair, so a
stolen token is usable at most once and the theft is detectable. Changing a
password revokes every outstanding session.

Because refresh tokens are single-use, both clients coalesce concurrent refresh
attempts. Without that, two requests racing a 401 would each try to spend the
same token and one would be told it is invalid — which, on a camp device, would
sign a shift out mid-consultation.
