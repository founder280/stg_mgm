# The field form, question by question

How each item of the *Onsite Medical Camp Data Collection* specification is
implemented, and where.

## Pre-camp data

| Specification | Where |
|---|---|
| Attendance (roster) confirmation, daily and duty-wise | `RosterEntry` + `Attendance`; `GET/POST /api/camps/:id/roster`, `POST /api/camps/roster/:entryId/attendance` |
| Camp arrangements — venue | `CampReadiness.venueReady`, `venueRemarks`, water, power, waste |
| Camp arrangements — drug list, number available | `CampInventory` per camp, with the drug master and reorder levels |
| Camp arrangements — equipment functional status | `ReadinessEquipment.status` — `FUNCTIONAL` / `NOT_FUNCTIONAL` / `NOT_AVAILABLE`, over the 14-item equipment master |
| Camp arrangements — feedback | `CampReadiness.feedback` |
| Location | `Camp.latitude` / `longitude`, plus the camp's zone and district |
| Images of the camp site (banner, emergency tray, overview) | `CampPhoto.kind`, with the three required kinds defined in the master |

## Auto-captured provenance

Every submission carries the metadata the specification lists. The client
supplies the first seven; the server stamps the last two, so a device cannot
forge them.

| Field | Column |
|---|---|
| Survey form name | `WalkIn.formName` |
| Survey form version | `WalkIn.formVersion` |
| Login username | `WalkIn.captureUsername` |
| Login time | `WalkIn.loginTime` |
| Device ID | `WalkIn.deviceId` |
| Unique instance ID | `WalkIn.instanceId` — also the sync idempotency key |
| Start and end time per record | `WalkIn.recordStartTime` / `recordEndTime` |
| Received time | `WalkIn.receivedTime` *(server)* |
| Submitted IP | `WalkIn.submittedIp` *(server)* |

Each leg of the split form carries its own capture metadata:
`Vitals.instanceId` and `ClinicalRecord.instanceId` are independently unique.

## The nine questions

### 1. Name of the walk-in
Uppercase by default, no special characters except space, limited to 50, with an
on-screen keyboard. Implemented in `walkInNameSchema`: letters and spaces only,
trimmed, collapsed whitespace, upper-cased on the way in. The field app filters
disallowed characters at the keystroke so the rule is visible, and the API
re-validates because a client can be bypassed.

### 2. Age in completed years / months / days
Three-part stepper — "type or swipe or press the +/-". 1–150 years enforced; at
least one part must be non-zero. Days for a newborn, months for an infant.
Stored as the three parts *and* as `ageTotalMonths` + `ageBand`, so age-band
aggregation needs no per-row arithmetic.

### 3. Gender
Male / Female / Transgender.

### 4. Address of residence
Tamil Nadu, other Indian states, or foreigner — each opening a different scope
of place picker.

Three parallel hierarchies over one village tree, as the specification requires:

- Revenue: District › Taluk › Panchayat › Village › Hamlet
- Health: District › HUD › Block › PHC › HSC › Village › Hamlet
- Data entry: District › Taluk › Village › Hamlet

Stored as one self-referencing `AddressUnit` tree tagged with a `hierarchy`, so a
hamlet is reachable from either chain and a case can be routed to both the
revenue officer and the DSU-IDSP of its area. Names carry a local-language
field alongside English.

The specification describes a map interface; the field app implements the same
drill-down interaction without tiles, because a camp tablet has no route to
fetch them. The result is identical — a hamlet id, whose pre-fixed geocode is
what the surveillance analysis actually runs on.

### 5. Mobile number
Ten digits, stored with the `+91` prefix, entered on an on-screen keypad so no
non-digit can be produced. Optional.

### 6. Days at the festival area before the reference date
Years / months / days, plus days already spent at the residence address —
together these separate pilgrims from temporary and permanent residents. The
reference date is `Event.stayReferenceDate`.

### 7. Symptoms present
The symptom master, editable per gathering via `Camp.symptomCodes`. Injury opens
a sub-form for abrasion / laceration / fracture with site and length; bites open
one for snake, scorpion, rabid animal, insect, other or unknown. The case
categories — critically ill, medical, surgical, ortho, paediatric, obstetric —
are recorded alongside and drive the referral pathway.

### 8. Time of onset
Only the symptoms actually reported are listed, each defaulting to one day, in
days and hours. The syndrome algorithm follows the IDSP definitions and the
reference is shown to the user with the classification — on the device before
forwarding, and on the record afterwards.

### 9. Place of onset
Home (defaults to the residence address), festival area (select the zone or
sub-division), or en route.

### 10. Measurements *(optional)*
Weight, height, blood pressure, pulse, temperature. BMI, blood-pressure stage
and newly detected hypertension are derived and stored. Vitals recompute the
triage score, so a hypotensive reading escalates a case that registered as
routine, and a red triage raises a critical alert immediately.

### 11. Laboratory investigations
Defaults to "Not advised". Sample suggestions are derived from the classified
syndrome and shown with their reason. Samples referred are noted against the
assigned laboratory; collected samples are labelled at the camp site and the
label carries into the transport manifest.

### 12. Treatment given
Form, drug, dosage pattern and number. The drug list is the camp's own
inventory, so a medical officer is never offered something the camp does not
hold. A standard treatment protocol is suggested for the classified syndrome,
annotated with anything that is out of stock so it can be substituted. Stock
moves only on dispensing, and an issue that would take a balance negative is
refused rather than clamped.

### 13. Cleaning and dressing
Notes for injury details and advice for review. Injuries carry a body site,
length and normalised marker coordinates for the L / A / # markings on a body
diagram.

## The four buttons

The specification places four actions at the bottom of every data-entry screen.
They are present on every screen of the field app:

- **New walk-in** — starts a fresh record
- **Summary** — the whole current record on one screen, including its provenance
- **Save and Forward** — commits this leg and hands it to the next
- **Waiting Pts.** — the queue, ordered by triage first and arrival second, so a
  red case that arrived last does not sit behind a queue of green ones

## The three-part split

The specification splits data entry into three legs. Each is a separate
permission, a separate endpoint and a separate capture record:

| Leg | Questions | Permission | Endpoint |
|---|---|---|---|
| Volunteer or paramedic | 1–9 | `walkin.register` | `POST /api/walk-ins` |
| Paramedic | 10 | `walkin.vitals` | `POST /api/walk-ins/:id/vitals` |
| Medical officer | 11–13 | `walkin.clinical` | `POST /api/walk-ins/:id/clinical` |
| Pharmacy | issue against the prescription | `walkin.dispense` | `POST /api/walk-ins/:id/dispense` |

A volunteer holds only the first. Attempting the second returns 403 naming the
missing permission — verified by test.

## Escalation

Critically ill cases are coordinated with the 108 service and the empanelled
hospitals near the gathering. A red triage raises a `CRITICAL_CASE` alert the
moment it is recorded, carrying the reasons that produced it; the referral
records the requested ambulance and the receiving facility, chosen by the
speciality implied by the case category.
