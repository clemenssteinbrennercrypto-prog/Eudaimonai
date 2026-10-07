# Focus Score audit — 15 September 2026

Scope: the derived Focus Score, its session accumulators, daily ledger, calendar
aggregation and Lab/Analytics presentation at base commit `702225a`. This is a
code audit with synthetic measurements, not an inspection of Clemens' private
session database or verification of his installed build.

## Decision and implementation — updated 16 September

Keep the native measurement engine and stored history. A complete rewrite is
not justified by these findings. The V1 rollup has a real non-monotonicity and
an ambiguous product meaning. Clemens chose a composite of work time, quality
and consistency, and authorized continuing the V2 implementation. The initial
concentration-only proposal was therefore not used.

V2 is implemented as a separate labelled view over the exact qualified raw
ledger. Lab and Analytics default to V2 and offer `V1 · Previous formula` for
the preserved historical calculation. Raw sessions and ledger contributions
are not rewritten. Attention is a proxy for quality; the camera does not measure
the quality of the user's output.

### V2 specification

```
E = sum(scoreSum) / sum(measuredSeconds)           # daily mean attention
M = sum(measuredSeconds) / 60                     # daily measured minutes
T = 1 - 0.1^(M / 120)                            # time credit, 0..1
dailyRaw = E * T
C = measured planned days / eligible planned days
F = 0.75 + 0.25 * C                              # consistency factor
periodRaw = mean(measured dailyRaw) * F           # week/month/year
display = round(raw)                             # round only at display
```

The 120-minute reference, 90% time credit there, and 25% maximum consistency
adjustment are explicit V2 product estimates, not research-backed constants.
They are pinned in `FOCUS_METRIC_V2`. Changing them later requires another
metric version, not quietly rewriting V2. Days do not use `F`; periods with no
eligible planned dates use `F = 1` and explicitly report no consistency evidence.
No qualifying measurements means absent score; genuinely measured zero stays
zero. The five-minute per-session floor and camera-generation isolation remain.

At fixed duration, better attention strictly improves the unrounded result.
At fixed attention, more time increases the result with diminishing returns.
Appending zero-attention time cannot improve it. Phase weights no longer enter
the formula, so the 54→55 inversion cannot occur in V2.

| Same attention of 80 | V2 daily score |
| --- | --- |
| 30 measured minutes | 35 |
| 60 measured minutes | 55 |
| 120 measured minutes | 72 |
| 240 measured minutes | 79 |

Example with an existing Mon–Fri plan: Monday's 72 stays 72 on Tuesday morning.
If Tuesday finishes without a session, Wednesday's week-to-date score is
`72 * (0.75 + 0.25 * 1/2) = 63`. Monday's stored daily value stays 72. This
adjusts regularity, not the measured quality or duration of Monday's work.

### Dated workdays

The first visit to a score view saves the visible, editable Mon–Fri default
effective that local date. No work schedule is inferred for earlier dates.
Subsequent edits apply from tomorrow; a second edit replaces only tomorrow's
pending plan. Rest days and future dates are excluded. Today is included only
once a qualifying session exists. A completed day with an unmeasured or
incompatible-generation session is unknown and excluded, not assumed missed.
The UI reports unknown dates and shows the numerator/denominator.

Plans are local settings under `eudaimonia_focus_schedule_v1`, including their
effective dates, and included as `focusScoreSchedule` in full JSON backups from
both repositories and the Analytics export. Save failures are shown and do not
make an unsaved plan authoritative. A workday edit does not change attention
thresholds or the daily ruler.

V2 reads historical raw totals with explicit provenance
`qualified_ledger_accumulators_v1`. The saved `focusMetricVersion: 1` fields still
describe their original session/ledger derivation; `metricVersion: 2` identifies
the new displayed rollup. This is not a native camera version change. V1 baselines
are not reused as V2 baselines. The new work schedule is not retroactively applied.

## What the preserved V1 formula measures

For qualifying sessions from one camera generation:

```
E = sum(scoreSum) / sum(measuredSeconds)
M = sum(measuredSeconds) / 60
D = sum(phaseSeconds * phaseWeight) / 60
V = 100 * (1 - exp(-D / 120))
Q = min(1, sqrt(M / 120))
daily = round(clamp(E^0.75 * V^0.25 * Q, 1, 100))
period = round(mean(unrounded daily scores of measured days))
```

Each session must have five measured minutes. Phase weights are lock-in 1,
ramp .75, arrival .5, recovery .35, fade .2, drift 0. These are product estimates,
not validated measures of work. Both `V` and `Q` depend on time: duration enters
twice below 120 minutes. At mean attention 80 and all time in lock-in, 30, 60,
120 and 240 measured minutes produce rounded scores 29, 47, 75 and 82.

Weekly and monthly scores are equal-weight averages of daily composite indices.
The separate average-attention statistic is weighted by measured seconds. These
answer different questions and must not both be labelled as concentration %.

## Findings and disposition

1. **Yesterday 72, weekly 72 today: aggregation is correct, presentation was
   ambiguous.** With one measured day, the period mean equals that day's score.
   An inactive day does not establish poor concentration and must not become a
   measured zero. Fixed labels show `Average of 1 measured day` and independently
   `No session today.` The day view remains absent. The exact 72 example is
   covered at both calculation and rendered-component levels.

2. **V1 can penalize a higher attention signal. Fixed in the separate V2.** Holding
   duration at 120 minutes, with no recent distraction, flow, pre-drift or good
   streak, the phase classifier assigns attention 54 to arrival (weight .5) and
   attention 55 to fade (weight .2). The composite falls from 49.8911 to 41.6728
   (displayed 50 to 42). This is reproduced using the production classifier and
   formula. It is not fixed by renaming the score or adjusting weekly averaging.
   A characterization test preserves these historical V1 values; the desired V2
   invariant is that better attention at equal measured duration cannot reduce
   the score. Changing the live phase classifier or V1 weights would silently
   reinterpret stored history. V2 therefore uses raw mean attention and elapsed
   measured time; it never feeds the V1 composite into its formula.

3. **Metric labels overstated their meaning. Fixed in both Focus Score views.**
   `Efficiency %` becomes `Average attention /100`; `Deep focus` becomes
   `Weighted focus time`; `Consistency` becomes `Measured days`. The expandable
   explanation describes duration, phase weighting, the five-minute gate,
   start-date attribution and the known V1 limitation. Inactive chart bars no
   longer claim a measured zero score in their tooltip.

4. **Stale date context. Fixed.** Analytics memoized the current period without
   a clock dependency. Both Focus Score views now refresh every 30 seconds and
   on focus/visibility changes, including return from a sleeping WebView.
   Historical selections are pinned to calendar dates and do not shift at
   midnight. Tests advance the clock with no changed history props.

5. **Future and invalid ledger records could affect results. Fixed.**
   Future calendar days cannot contribute scores, select the active generation,
   extend measured-day totals or enter the baseline. Future session timestamps
   cannot select the comparison generation. Unknown explicit ledger generations
   and `unmeasured` markers carrying stale numeric fields are rejected. A future
   explicit period has zero elapsed days. Old untagged V1 ledger contributions
   retain their documented compatibility fallback.

## Remaining design limits

- A day with several sub-five-minute sessions cannot qualify by pooling them.
  This is a per-session gate, not a daily minimum. It is preserved and explained.
- Sessions crossing midnight belong entirely to their start date in the ledger,
  while timeline samples can appear on both dates. Exact calendar splitting
  requires future per-day raw accumulators; existing session totals cannot
  supply that split without estimating. Start-date attribution is now disclosed.
- A single measured day is weak evidence for a typical week. Showing the sample
  count is appropriate; filling missing days with zeros is not a measurement.
- The ledger has day keys, not complete session timestamps. It cannot detect an
  incorrectly dated contribution later on the current day from its totals alone.
- Native V2 camera generation and Focus Metric V1 are separate versions. Neither
  should be renamed or conflated when introducing a new derived metric.
- V2 still asks for a typical daily work contribution, adjusted for regularity,
  rather than simply summing weekly hours. Splitting the same total time over
  different dates can therefore change the weekly result. At identical daily
  time and quality, more fulfilled planned days improve consistency.
- A single five-minute session can establish a measured workday, but its small
  time credit also enters the period's daily average. Counting a day does not
  award an independent score bonus. A partly measured day can qualify; coverage
  remains diagnostic rather than an all-or-nothing camera gate.
- The Mon–Fri default may not match civil service or irregular work schedules;
  it is visible and editable. Holidays and one-off leave do not have individual
  overrides in this first implementation.

## Verification

New regressions failed against the original implementation. Valid same-generation
days retain their V1 values. Tests cover duration weighting before aggregation,
equivalent qualifying session splits, the 72 example, future dates, rejected
records, unknown generations, midnight rollover and pinned historical views.

Full suite/build results and native/manual limits are recorded in the linked
[release evidence](release-readiness-2026-09-02.md#focus-score-audit--15-september-2026).

## Product correction — 22 September 2026

Real use showed that V2's composite is too easy to read as a grade. A typical
two-hour day at average attention 80 receives `80 × 0.9 = 72`, even though the
camera signal's neutral face-present base is already 68. The arithmetic is
monotonic, but the product meaning is weak: an arbitrary time-credit curve turns
ordinary measured presence into a confident-looking 1–100 result.

The active product therefore no longer presents V2 as its headline. The Lab
shows four separate facts instead: literal Deep Focus time, measured work time,
average attention on its 0–100 signal scale, and fulfilled/eligible planned
workdays. Historical V1/V2 calculations remain versioned and inspectable in the
old analysis component; no stored day is rewritten.

Literal Deep Focus is a new forward-only accumulator:

```text
deep-focused second = live Flow state AND attention score >= 72
```

The live Flow state requires 90 qualified seconds of score >= 72, stable
gaze/head movement and no active distraction reason. Those first 90 seconds are
warm-up and do not count. A 1.5-second interruption debounce prevents a single
noisy landmark frame from erasing the entire warm-up. Unqualified samples are
still withheld from Deep Focus, and a sustained interruption exits Flow and
resets the gate.
This is intentionally stricter than `focusedSeconds` (threshold 40), the
`lock_in` phase (which can follow four minutes at 65), and V1's weighted
`deepFocusSeconds`; none of those fields is relabelled. Old sessions lacking
`deepFocusTimeVersion: 1` report Deep Focus as unavailable rather than receiving
an estimate from a looser ruler.

## Real-use reversal — 23 September 2026

The Deep-Focus-only Lab was rejected after one day because existing sessions do
not carry the new forward-only accumulator and therefore left the primary view
blank. That refusal was mathematically honest but a worse product: the user lost
the useful number they already understood.

V1 is restored as the active Lab headline. Literal Deep Focus remains as a
supporting time value when available; measured work, average attention and
measured days remain visible. Old sessions therefore show their existing V1
score immediately without receiving invented Deep Focus minutes. The workday
plan remains editable context but explicitly does not alter V1.

The first restoration rendered unavailable Deep Focus as a bare dash. That was
mathematically honest but operationally ambiguous: it looked as if the metric
had disappeared. The Lab now always labels `Deep Focus time` and states whether
the selected period has no measured session, contains sessions that did not
record exact Flow time, has partial exact coverage, or has complete exact
coverage. A recorded zero remains `0s`; unavailable history remains `—`.

## Flow-gate correction — 24 September 2026

Real use showed that the first exact accumulator could remain at zero even
during an attentive session. The cause was frame-level brittleness: every
single unqualified camera frame immediately erased up to 89.9 seconds of valid
warm-up. At native frame rates, ordinary landmark jitter made entry into Flow
improbably strict even though the intended rule was sustained attention, not
thousands of flawless individual frames.

The gate now accumulates qualified frame time, withholds every unqualified
measurement span, and resets only after 1.5 seconds of sustained interruption.
Camera faults, pauses and hard transitions still reset it immediately. The live
session now always shows the Deep Focus timer and its 90-second warm-up progress,
so a stuck gate is visible before the session ends. Timeline samples record the
Flow/deep-focus state for future diagnosis.

## Period-total correction — 24 September 2026

Real use exposed a separate aggregation error: the exact-Flow aggregator
correctly marked a period incomplete when older sessions lacked `flowSeconds`,
but the Lab ignored that refusal and displayed `knownSeconds` anyway. A week
therefore appeared to contain only the two exact minutes recorded today.

That partial subtotal is no longer presented as a period total. The Lab period
rail now shows V1's versioned, phase-weighted `deepFocusSeconds` as `Focus time`.
It is available for qualifying historical sessions and is explicitly labelled
as phase-weighted; it is not relabelled as literal Flow. Exact `flowSeconds`
remains available in individual session analysis. A selected historical day is
read on the camera generation that actually measured that day, while weekly and
monthly calculations still refuse to combine camera generations.

## Quality-only Focus Score and exact time hierarchy — 26 September 2026

The earlier composite still made session length look like concentration: at the
same attention quality, a short useful session received a much lower headline
score than a long one. That conflated three separate questions and made the
score unnecessarily discouraging.

Focus Metric V3 is now the only user-visible Focus Score in Lab and Analytics:

```text
Focus Score V3 = sum(attention score × measured seconds) / measured seconds
```

It is average measured attention quality on the existing 0–100 scale. Duration,
phase weights, workday consistency and Deep Focus do not enter the formula. The
existing five-minute-per-session eligibility rule, missing-camera refusal and
camera-generation isolation remain intact. Multi-session periods weight each
measured second equally. V1 and V2 remain unchanged in code and storage; their
scores and baselines are not presented as V3 history.

The user-visible hierarchy is now:

- **Focus Score:** measured attention quality, 0–100.
- **Focus Time:** active session duration (`actualSeconds`), excluding pauses.
- **Deep Focus:** exact time in sustained high-attention blocks.

Measured time is a technical coverage field, not a fourth result. It becomes
visible only as a warning when less than 90% of Focus Time was measurable; gaps
are excluded from the score rather than filled as focus or distraction.

Deep Focus time advances to version 2. The score threshold remains 72 and entry
still requires 90 seconds, but ordinary movement is no longer required twice:
head stability already contributes to the attention score, so the separate
head-fidget gate was removed. The interruption hold is five seconds. A
successful entry credits the qualified warm-up seconds retroactively; an
abandoned warm-up earns zero, and interruption seconds never count. Historical
version-1 exact values are retained but not relabelled. Period Deep Focus is
shown only when every included session has a valid version-2 value, preventing
a known subset from masquerading as the whole period.

## Quality-gated work Focus Score — 27 September 2026

Product decision (Clemens): a good ten-minute session must not score like two
good hours. Focus Time, Average Attention and exact Deep Focus all enter one
headline, with work volume dominant as long as quality holds. A score remains
an accumulated-work index, not an attention percentage or a claim about output
quality.

### Formula

For all qualifying contributions in the selected period, after the existing
five-minute eligibility and camera-generation isolation:

```text
M = sum(measuredSeconds) / 60
A = sum(scoreSum) / sum(measuredSeconds)
D = sum(flowSeconds) / 60

Q = clamp((A - ALERT_SCORE) / (FLOW_SCORE - ALERT_SCORE), 0, 1)
  = clamp((A - 38) / 34, 0, 1)

effectiveMinutes = (M + 0.25 × D) × Q
referenceMinutes = 80 × max(1, elapsed Monday–Friday weekdays)
x = effectiveMinutes / referenceMinutes
Focus Score = 100 × x^1.3 / (1 + x^1.3)
```

`src/lib/focusScore.js` holds this stable current product (`FOCUS_SCORE`,
`buildFocusScorePeriod`) with internal `metricVersion: 4`. V1–V3 remain
readable and unchanged; the version number is not user-facing.

- Measured time is the volume. Pauses and camera gaps earn nothing because
  their attention quality is unknown.
- Mean attention is a quality gate. At or below the alert band time earns no
  credit; at Flow-quality mean attention it earns full credit. Additional poor
  time may lower the result by lowering the period mean. At unchanged quality,
  more time always raises the unrounded score.
- Exact Deep Focus (`deepFocusTimeVersion: 2`, `flowSeconds`) receives a 25%
  continuity bonus. It is already derived from attention, so it is deliberately
  a modest bonus rather than an independently weighted third score.
- Raw time, score sum and exact Flow seconds are summed before one period
  quality factor is calculated. Weeks and months never average daily scores.
- The bounded Hill curve uses exponent 1.3 to soften the first minutes before
  diminishing returns take over. At full quality and without a Deep Focus
  bonus, one hour scores about 41, two hours 63, four hours 81 and eight hours
  91. More work always helps at fixed quality while micro-sessions receive
  little credit.
- The period reference uses fixed Monday–Friday weekdays. Weekend work adds
  credit without adding a reference day. V4 deliberately ignores the older
  editable workday plan so a user cannot raise the score by selecting fewer
  days.

### Honest start boundary

Exact Deep Focus V2 is forward-recorded and cannot be reconstructed from the
older `deepFocusSeconds`, Lock-in phases, a headline percentage or five-second
timeline samples. V4 therefore starts on the first qualifying day carrying a
genuine V2 exact value for the active camera generation.

- Days before that boundary remain readable under V1–V3 but are marked outside
  the current score.
- Focus Time remains the complete active clock for every session in the
  selected calendar period; the V4 boundary and camera generation never
  truncate it. Deep Focus remains unavailable unless every displayed session
  carries an exact value. Average Attention and Focus Score use only their
  qualified post-boundary camera generation, and the UI states when that is a
  smaller measured interval than Focus Time.
- If any qualifying contribution after the boundary lacks exact Deep Focus,
  the entire selected period refuses with `missing_exact_deep_focus`; it never
  presents the known subset as the whole.
- On the cutover day, genuine session start timestamps exclude contributions
  proven to predate the first exact value. A missing-exact contribution at or
  after that timestamp refuses. If an old entry has no genuine start timestamp,
  its ordering is unknowable and the day refuses rather than guessing.
- A historical period ending before the boundary still shows Focus Time, which
  is ruler-independent, but does not reconstruct Focus Score, Deep Focus or
  Average Attention under V4.

Ledger contributions copy only genuine `deepFocusTimeVersion`, `flowSeconds`
and the session start timestamp. Backfill adds missing exact fields from the
original session record without changing stored V1 values. `flowSeconds` must
not exceed measured time, even fractionally. Nothing derives or estimates Flow
for historical sessions.

### Calibration questions

- **80 minutes, exponent 1.3, 25%, and the linear 38→72 quality ramp are
  versioned product estimates, not research constants.** Review them after 30
  valid V4 measured days; a changed parameter requires a new metric version.
- A week rewards total qualified volume, not its distribution: one long day can
  equal several shorter days, while elapsed fixed weekdays still set the
  reference.
- Today counts as a planned day from midnight, so a weekly score can step down
  at the start of a new planned day before work is recorded. A reference based
  only on measured days would instead reward skipping days and was rejected.
- A personal duration target is deliberately not a score input. It is easy to
  manipulate by choosing a lower target and would give identical work a
  different score. A future goal feature may show progress separately, but it
  must never change this measurement ruler.
- The camera signal is an attention proxy. It cannot establish whether the
  produced work was correct or valuable; output evidence remains a separate
  product fact.

## Attention scoring generation 4 — 7 October 2026

The Focus Score V4 period formula above is unchanged. The per-frame attention
ruler feeding it is now generation 4 because an evidence review found that
absolute blink-rate bands, mouth-opening/yawn penalties, the webcam
"PERCLOS" proxy and a post-distraction 40% ramp rate were not defensible as
precise focus measurements. They were removed rather than retuned.

New sessions keep the pinned native V2 camera/model hashes and store
`attentionScoringVersion: 4`. V4 retains V3's earned-top ceiling. Earlier
sessions remain readable under their own generation; daily rollups and comparisons never combine them with V4. Sustained
eye closure is the only retained ocular penalty. It is measured against a
robust personal open-eye EAR baseline and must hold for 1.5 seconds. Its 0.55
ratio and hold are conservative versioned product boundaries, not research
constants or a medical fatigue diagnosis. The full evidence boundary and
primary sources are recorded in
[`focus-score-evidence-2026-10-07.md`](focus-score-evidence-2026-10-07.md).

The derived longest Deep Focus block now includes the successfully qualified
90-second entry span already credited by exact `flowSeconds`. Stored `inFlow`
samples prove whether a `deepFocused` run opened a new Flow span, so a retained
brief interruption never earns the warm-up twice. A historical timeline without
that gate state returns unavailable rather than receiving an estimate.
