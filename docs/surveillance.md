# Surveillance and analytics

Four analyses run on a schedule (default every ten minutes) and write their
conclusions as alerts, each carrying the evidence that produced it.

Everything here is implemented as pure functions in
`packages/shared/src/analytics`, so each one is unit-tested against known inputs
rather than only observed in aggregate.

## 1. Aberration detection

Daily counts per syndrome, per camp and per district, run through five detectors.

**EARS C1, C2, C3.** Short-baseline Shewhart scores over a seven-day window. C1
uses no guard band; C2 leaves a two-day gap so a slow-building outbreak does not
contaminate its own baseline; C3 accumulates the last three C2 excesses, so three
consecutive mild days trip an alarm no single day would. Alarm at 3 standard
deviations (2 for C3). A zero baseline standard deviation is floored at 1, so a
jump from a flat zero still scores instead of dividing by zero.

**EWMA.** An exponentially weighted moving average control chart (λ = 0.4,
L = 3) catches slow sustained rises that a single-day test misses.

**CUSUM.** A one-sided cumulative sum on standardised counts (k = 0.5, h = 4)
accumulates small excesses that never individually cross a threshold.

The EWMA and CUSUM charts centre on a **guard-banded baseline**, not on the whole
series. This matters: including the days under test inflates both the mean and
the standard deviation, and the chart then masks the very signal it exists to
find. The unit tests pin this — a series climbing 5 → 12 over ten days alarms on
EWMA and CUSUM while EARS C1 correctly does not.

Severity comes from agreement, not from any single statistic: three or more
detectors agreeing is `HIGH`, two is `MEDIUM`, one is `LOW`. Only `MEDIUM` and
above raise an alert, which suppresses single-detector noise on camp-scale counts.

## 2. Spatial clustering

**Kulldorff's circular spatial scan statistic** under a Poisson model, run across
festival zones with expected footfall as the population denominator. Every zone
is taken as a centre in turn, circles of growing radius are evaluated, and the
window with the highest log-likelihood ratio is kept. Overlapping windows are
reduced to the strongest.

Only leaf zones are scanned — including a parent zone alongside its children
would double-count.

The Monte-Carlo p-value is deliberately omitted: on camp-scale data the ranked
likelihood ratio and relative risk are what officers act on, and leaving it out
keeps the computation cheap enough to run on every dashboard refresh. The
threshold for raising an alert is a likelihood ratio above 5 with a relative risk
above 1.5.

**DBSCAN** is also available for clustering individual cases by hamlet geocode,
where the question is "is there a cluster at all" rather than "which pre-defined
area carries excess risk". It finds clusters of any shape and does not split one
that straddles a grid boundary.

## 3. Forecasting and stockout projection

**Holt's linear trend method** for footfall and drug consumption. Double
exponential smoothing rather than something heavier because a gathering runs for
days to weeks — there is never enough history to fit seasonality, and an officer
must be able to see why a number moved. The prediction band widens with the
square root of the horizon.

Days-to-stockout is projected from the **forecast** burn rate rather than a flat
average, so a camp whose footfall is climbing is flagged before it runs dry. The
alert names the quantity to indent from the district drug store.

## 4. Operational checks

A camp that has not synced within the threshold, and a camp whose equipment
readiness is below 90% or unreported for the day.

---

## Clinical decision support

Distinct from the surveillance layer, and deliberately rule-based.

**Syndrome classification** follows the IDSP syndromic surveillance categories.
Definitions are stored in the database as declarative rule trees, evaluated by a
shared engine, so guidance can be revised and versioned without a code release.
Every classification carries its case definition and its citation, shown to the
clinician and stored on the record.

**Triage scoring** assigns points for red-flag symptoms, critical bite types,
abnormal vitals and the extremes of age, and grades to GREEN / YELLOW / ORANGE /
RED. Every point carries a reason string, shown to the medical officer and
stored with the record. A medical officer will not, and should not, act on a
number they cannot interrogate — which is why this is not a model.

Vitals recompute the score, so a hypotensive reading escalates a case that
registered as routine.

**Sample and treatment suggestion** derive from the classified syndrome. Treatment
protocols are matched against the camp's own inventory before being offered, and
anything out of stock is named so it can be substituted.

## Reading an alert

Each alert stores machine-readable evidence, shown in the console behind the
"Evidence" toggle:

- an aberration carries every detector's statistic, threshold and expected value
- a cluster carries its centre, radius, observed and expected counts, relative
  risk and likelihood ratio
- a stockout carries the on-hand quantity, the projected burn rate, days
  remaining and the reorder quantity
- a critical case carries the triage score and the reasons that produced it

Alerts are keyed on a stable identity, so a persisting condition updates one row
rather than generating a new alert every pass. An acknowledged alert stays
acknowledged while the condition holds, and reopens only if the severity rises.
