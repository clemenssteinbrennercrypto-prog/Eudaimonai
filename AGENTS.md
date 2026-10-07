# Eudaimonai — briefing for coding agents

Read this fully before your first edit. It exists so you start where the last
agent left off instead of relearning — including the things that were tried and
rejected, which are cheaper to read than to rediscover.

Several agents work on this repo (Claude via Claude Code, "Stony" via OpenClaw,
and you). Everyone pushes to `main`. Assume the working tree is behind: **`git
pull` before you start and before you push.**

---

## 1. What this is

A measurement instrument for focused work — the aim is "the WHOOP for cognitive
performance". It is one native macOS product with two layers:

- **Embedded UI** (`src/`) — React 18 + Vite, plain JSX, no TypeScript. Bundled
  into the Tauri WebView; it is not a standalone browser product. Receives
  native MediaPipe landmarks over Tauri IPC, scores them, and renders the live
  session. It does not own the live-session camera.
- **Native core** (`companion/src-tauri/`) — Tauri 2 + Rust. Hosts the UI,
  captures and infers faces through AVFoundation + MediaPipe, watches which
  app/site is frontmost, and **blocks** distracting apps and sites during a
  session. Rust and React communicate only through Tauri commands and events;
  there is no local HTTP service.

**What the product is for (decided 6 Oct 2026).** Help an ambitious,
data-driven knowledge worker see how well they actually work, why some days are
better, and how to improve. Camera attention is infrastructure, not the selling
point. The long-term model is attention data + computer activity + work context
+ history. Blocking (Protection) is an optional per-session tool, not the
differentiator — an earlier version of this file said "Every competitor
measures. This one intervenes"; that is no longer the direction. When weighing a
feature, ask whether it makes the user's own performance more measurable,
comparable or explainable. The metric system it is built on is in §11.

Voice: an instrument, not a guardian. Neutral readouts, no emoji, no scolding,
no cute gamification. And never interrupt a running session with a question —
any self-report happens after the session ends (§6).

**Who it is for:** Clemens, 18, Austria. Launching around September 2026,
starting civil service the same month, so he has roughly 10–15 h/week from then.
Optimise for things that survive low maintenance.

**Positioning claim that constrains engineering:** *nothing leaves your device.*
The camera feed, the activity log, window titles and file names never go
anywhere. There is exactly one deliberate exception, described in §5.

**Supported platform:** Apple Silicon Macs (`aarch64-apple-darwin`, M1 or
newer), macOS 11+. Intel Macs are intentionally unsupported as of 1 Sep 2026.
Do not restore Universal/x86_64 artifacts: their camera slice could start the
app but could never run the native measurement engine.

---

## 2. Run it

```bash
npm install
npm run dev        # isolated UI development only; native features unavailable
npm test           # vitest, currently 1001 tests — must stay green
npm run build      # production bundle
```

Rust side:

```bash
cd companion/src-tauri
cargo test         # currently 84 tests (14 library + 70 app)
cargo check
```

Full native app (needs Rust + tauri-cli, ~2 min):

```bash
npm run build:companion
```

### Gotchas that have cost real time

- **The dev server port moves.** It picks the first free port from 5173 up. Check
  the actual output rather than assuming.
- **`npm run build` succeeding proves very little.** The bundler does not flag
  undefined identifiers, so a removed variable that is still referenced builds
  clean and throws at runtime. This has already shipped a crash once. After
  removing anything, grep for the name.
- **The DMG step of `build:companion` often fails** on a leftover mounted volume
  from the previous build. The `.app` itself is fine. Fix with
  `hdiutil detach /Volumes/dmg.* -force` and delete `bundle/macos/rw.*.dmg`.
- **Version scheme.** CI builds are `0.1.$(date -u +%y%m%d%H%M)`; `tauri.conf.json`
  is pinned at `0.1.2`. Any CI build therefore outranks any local one, and the
  auto-updater will replace a locally installed build within minutes. To install
  a local build for testing, set a date-based version first, then restore the
  file. Do not commit the bumped version.
- **`/Applications/Eudonomia.app` is what the user actually launches** (the
  installed bundle folder keeps its original name across updates even though
  `productName`/display strings are now "Eudaimonai" — macOS/the updater does
  not rename an existing `.app` directory in place). Building
  into `target/release/bundle` changes nothing for them until it is copied there.
- **A push to `main` that touches companion build inputs updates only
  internal-channel installs.** Two release channels exist and they do not meet.
  `companion-test.yml` has a `paths` filter; a matching push builds and publishes
  to the `internal-test` tag, while docs-only and other excluded pushes do not
  move that channel. The checked-in base config and `tauri.test.conf.json` both
  ask `internal-test`. `companion-release.yml` must apply
  `tauri.release.conf.json` to ask `releases/latest`, and fires only on a
  `release-v*` tag (or an explicitly started live publication). A public install
  therefore does not receive a pushed main commit, while an internal install
  receives a matching one within minutes. **Before telling the user to look at
  something, check the build badge, the config/endpoint that build used, and
  when that channel last moved.**

---

## 3. Map

```
src/
  App.jsx                    screen router + shared session state + history load
  components/
    Onboarding.jsx           first run: three slides + live camera check
    AppShell.jsx             macOS sidebar window (Lab, Session, Workspace,
                             Protection, Analytics; ⌘1–⌘5)
    LabDashboard.jsx         home: Focus Score rings, attention strip, recent
    LabQuickStart.jsx        name + length + start, above the Lab
    SessionIntentScreen.jsx  "New Session" planner: plan, tags, energy, folder
    WorkspaceManager.jsx     desk layout editor (screens, pads, phone, camera)
    FocusAppsScreen.jsx      Protection: per-session app/site blocking setups
    SessionScreen.jsx        2800 lines. Camera, scoring, alerts, blocking sync.
    EndScreen.jsx            debrief → SessionReport.jsx + sessionReport/*
    analytics/               AnalyticsShell: Overview (AnalyticsStory) and
                             Details (DataExplorer); Overview.jsx/Patterns.jsx
                             are not mounted anywhere at present
  lib/
    attention.js       (+test)  PURE scoring/gaze maths — the invariants live here
    attentionSampling.js        per-tick accumulation, Flow gate, 5 s timeline
    focusScore.js      (+test)  the current daily Focus Score (metricVersion 4)
    focusMetric.js     (+test)  focus ledger, periods, versioned history
    sessionAnalysis.js (+test)  debrief facts, conclusion, one next action
    personalBaseline.js (+test) the user's usual day (median of 28 days)
    personalRecords.js (+test)  personal records and the debrief's new-record note
    weeklyReview.js    (+test)  week vs week, and when the weekly notification is due
    sessionMeasures.js (+test)  lapses, recovery, switches, longest Deep Focus
                                block — derived from the stored 5 s timeline
    analyticsModel.js  (+test)  Analytics overview/details aggregations
    calibration.js     (+test)  what YOUR history says about how you work
    sessionIntent.js   (+test)  activity classification, artifacts
    modelClient.js              the ONLY place that talks to a model (transport;
                                optional providers are disabled at launch)
    sessionRepository*.js       SQLite (native) / localStorage (dev) history
    nativeCompanion.js   (+test) the only React ↔ Rust IPC boundary
    storage.js                  localStorage settings
companion/src-tauri/src/
    activity.rs        frontmost app/tab via AppleScript, app hiding
    blocking.rs        website blocking via /etc/hosts + privileged helper
    native.rs          Tauri commands, events and shared native state
    native_camera*     AVFoundation capture + MediaPipe inference (§10)
    output.rs          output evidence — did the work actually move
    db.rs              SQLite session store + focus ledger
```

**`SessionScreen.jsx` is 2800 lines with ~125 pieces of state.** It is the known
weak point. Every cross-cutting bug so far came from subsystems interacting
inside it. Splitting it is planned for after launch; until then, prefer
extracting pure logic into `src/lib/` (with tests) over adding to it.

---

## 4. The invariants

These are real regressions, each of which recurred because a later agent did not
know it had already been fixed. **Check this list before and after touching
scoring or detection.**

1. **Circadian direction.** `getCircadianFactor()` returns < 1.0 during tired
   hours. Tired hours must make the alert fire SOONER:
   `alertDelayMs * circFactor` — multiply, never divide. Inverted and re-fixed
   more than once.
2. **Every penalty needs a hold time or debounce.** No exception. One bad frame
   must never subtract score. Follow the existing 3-frame-deadzone or
   `*_HOLD_MS` patterns.
3. **No dead-alias variables.** Do not add a variable that is just
   `= someExistingVar` with a comment describing a distinction it does not
   implement.
4. **Accumulators reset on hard transitions.** Ramp and streak refs must zero
   when the face is fully absent or the camera faults, or a stale bonus leaks
   into a score that should be zero.
5. **`git log -S"<constant>"` before changing a threshold.** Several carry
   research citations and were tuned deliberately.
6. **Self-check after editing.** Scan changed lines for `/` vs `*`, `<` vs `>`,
   `&&` vs `||`. Most regressions here were a one-character inversion that looked
   right.
7. **Yaw sign convention.** `yawSigned > 0` means the head turned to the user's
   LEFT — confirmed from live data and consistent with the head-turn counters.
   Code mapping yaw to a screen side must pair positive yaw with a LEFT screen.
   This was inverted once: "looking left" read as "productively facing the right
   monitor", which suppressed the penalty *and* paid a bonus for looking away.
   Separately, `irisH > 0` means eyes toward the user's RIGHT — the OPPOSITE
   convention. Scoring depends on that opposition. Do not "simplify" it without
   re-deriving from data.
8. **The score bands are named constants and must stay separated.**
   `ALERT_SCORE` (38) < `FOCUSED_SCORE` (40) < `GOOD_STREAK_SCORE` (65) <
   `FLOW_SCORE` (72), all in `attention.js`. `FOCUSED_SCORE` decides
   `focusedSeconds`, which IS the
   reported focus percentage — history trends, calibration, the end screen and
   the CSV export are all derived from it. Removing the energy profile replaced
   all three with the literal `1`, so every second at score ≥ 1 counted as
   focused and the metric stopped separating a good session from a bad one.
   Nothing failed: no test touched them, and the downstream tests fabricate
   `focusedSeconds` from a percentage instead of measuring it. The band tests in
   `attention.test.js` now fail if any bar collapses — do not weaken them.
   Note the bands do NOT protect against a dead camera: 68 (the no-data default)
   clears `FOCUSED_SCORE`. That is what the frame heartbeat and `trackingFaulted`
   are for; the two guards are independent and both are load-bearing.
9. **Derived Focus Score history is versioned, never silently reinterpreted.**
   `focusMetric.js` summarizes the live signal without changing it. Its V1
   parameters are explicit product estimates, not research constants. Current
   sessions enter with the matching attention-scoring version. Pre-ledger
   sessions may enter only through the explicit `legacy_timeline_v1` migration,
   which requires their saved five-second score timeline plus exact phase-second
   totals and records that provenance; an old focus percentage alone is never
   enough. Coverage is diagnostic, not an all-or-nothing gate: after five real
   measured minutes, V1 scores only measured seconds and its volume term gives
   no credit for gaps. Legacy sessions without raw measurements stay absent
   rather than being guessed. Review V1 after 30 valid measured days and create
   V2 for changed parameters instead of rewriting stored V1 days.

   Focus Metric V2, introduced 16 Sep 2026, remains a separate version in
   `focusMetricV2.js`: continuous measured-time credit × mean attention, plus
   a period consistency factor from dated workday plans. It reads the exact
   qualified ledger accumulators without changing saved V1 session/ledger
   fields. Focus Metric V3 (`focusMetricV3.js`, 26 Sep 2026) was the
   attention-average score and remains readable but inactive.

   The active Lab and Analytics score since 27 Sep 2026 is the current Focus
   Score in `focusScore.js` (stable name; internal `metricVersion: 4`, never a
   user-facing label — do not create `focusMetricV4.js`). For a period:
   `A = scoreSum / measuredSeconds`,
   `Q = clamp((A − ALERT_SCORE) / (FLOW_SCORE − ALERT_SCORE), 0, 1)`,
   `effective = (measuredSeconds + 0.25 × flowSeconds) × Q`,
   `reference = 80 × max(1, elapsed Monday–Friday weekdays)`,
   `x = effectiveMinutes / reference`, and
   `score = 100 × x^1.3 / (1 + x^1.3)`. Time is the base, mean attention is the quality gate and
   exact Deep Focus V2 is a modest continuity bonus. Raw period inputs are
   summed before one quality factor is calculated; daily scores are never
   averaged.

   This ruler deliberately starts at the first qualifying session carrying
   `deepFocusTimeVersion: 2`. Older sessions remain readable under V1–V3 but
   never enter V4, and missing exact Deep Focus after the start makes the whole
   selected period refuse rather than show a partial subtotal. Ledger
   contributions copy genuine `flowSeconds`, its version and the session start;
   they never infer Flow from `deepFocusSeconds`, phase totals or a timeline.
   On the cutover day, genuine start timestamps exclude provably earlier
   contributions; a missing timestamp or a missing exact value at/after the
   boundary refuses rather than guessing. A wholly pre-V4 historical period
   still shows ruler-independent Focus Time without reconstructing a score.
   The 80-minute reference, 1.3 curve exponent and 25% bonus are versioned
   product estimates to review after 30 valid V4 days. V4 uses fixed
   Monday–Friday weekdays; it does
   not read the older editable workday plan. A self-selected duration target or
   schedule must never change the score: it is gameable and would give
   identical work a different ruler.
   Do not mix baselines or camera generations. See
   `docs/focus-score-audit-2026-09-15.md` for the formula, rejected
   alternatives, estimates and limits.
10. **Exact Flow and historical focus time are two different rulers.** The
    per-session exact metric records `flowSeconds` only while the live Flow state is active, the
    current span remains Flow-qualified and the score is still at least
    `FLOW_SCORE` (72). Entering Flow requires 90 seconds of qualified,
    distraction-free attention. A five-second interruption debounce prevents a
    noisy landmark frame from erasing the warm-up, while those unqualified
    spans do not count; a sustained interruption resets the gate. Once entry
    succeeds, the qualified warm-up seconds are credited retroactively. A
    failed warm-up earns nothing. Head stability is already part of the score
    and must not be required a second time by the Flow gate. `focusedSeconds`
    starts at 40 and the old
    `deepFocusSeconds` field is a weighted V1 estimate, so neither may be shown
    as literal Flow time. Sessions without `deepFocusTimeVersion: 2` remain
    unknown instead of being backfilled from those looser fields. The current
    Focus Score uses this exact V2 value only after its explicit start boundary;
    it does not substitute Lock-in or weighted phase time. The Lab does
    not show a partial Deep Focus subtotal: every session in the selected period
    must carry valid V2 exact time, otherwise the period value is unavailable.
    `Session time` (labelled "Focus time" until 6 Oct 2026) is the sum of active session `actualSeconds`, excluding
    pauses. Measurement coverage stays internal unless it falls below 90%, when
    the UI warns that the score used measured time only.
    A selected single historical day may render on its own camera generation;
    multi-day periods still use one generation and never blend camera measurement methods.
11. **The top of the scale is earned with time (7 Oct 2026, V3; rule
    reworked in V5).** Face, a still head and work-zone gaze (plus blinking
    before V4) score high by themselves; with the focus-app bonus and the
    2-minute ramp, sitting calmly read 99 after ~30 s, so everything above 72
    meant "present", never "for how long".
    The shown score is now `min(signal, earnedTopCeiling(earnedMs))`
    (`attentionScore.js`): the ceiling starts at `EARNED_TOP_FLOOR` (75) and
    its distance to 100 halves every 10 min of earned attention (80 at 3 min,
    90 at 13, 95 at 23). Earned time is stepped on the smoothed signal in the
    zones the user already sees: the Deep Focus band (≥ 72) earns, a dip
    between 40 and 72 **holds** (never drains), and only a lapse — below 40 for
    ≥ 10 s, the definition `sessionMeasures.js` counts, leaving the desk
    included — drains it at 5×. Uncertain tracking and camera outages hold; a
    pause resets. Smoothing and holds run on the uncapped signal
    (`signalScoreRef`), never on the shown score.
    **Do not key earned time to the raw pre-ramp score again.** V3 and V4
    earned only while the pre-ramp score was ≥ 72 and drained at 3× on every
    frame below it. That value dips for a glance or a slight head turn (and in
    V3 a blink cluster), so in a real session the user never got past ~80.
    Their 15-minute half-life also read as too slow. V5 is the rule above.
    The ceiling only ever lowers the shown score, so it cannot leak score after
    the user returns; that is why leaving the desk drains it instead of
    zeroing it (invariant 4 is about bonuses).
    **The floor must stay above every band** (38, 40, 55, 65, 72): that is
    what keeps Deep Focus, the Flow gate, focused seconds, lapses, recovery
    and phases bit-for-bit identical, verified on 45,000 real recorded frames
    and pinned by the band test in `attentionScore.test.js`. Lowering the floor
    below 72 to make presence "look like 65" silently redefines Deep Focus,
    which §11 freezes. What the ceiling does change — the number above 75, mean
    attention, the Focus Score's quality factor on mixed days — is why each
    version of the rule is its own generation (V3 introduced it, V5 =
    `NATIVE_CAMERA_MEASUREMENT_V5` earns in the band; same camera and models as
    V2). Earlier sessions stay readable and are never compared with V5. Tune
    the floor, half-life or drain only with a new generation.

---

## 5. Design principles — the expensive ones

These were argued out and paid for. Violating them will get the change reverted.

**Refuse rather than guess.** `calibration.js` says nothing below 8 usable
sessions, compares no bucket below 3 samples, and calls no difference a pattern
below 12 points. A confident sentence from four sessions is a horoscope, and it
destroys trust faster than saying nothing. Most of its tests are about the
silence, not the speech.

**Never report what was not measured.** If the camera pipeline delivers no
frames, the score is not zero and not the default — it is absent
(`trackingFaulted`, `finalScore: null`). This app once counted every second as
focused when the camera was off, producing a fabricated ~100% session. Do not
reintroduce a default that can pass for a measurement.

**One ruler, every day.** Nothing may shift a scoring threshold based on
self-reported state. An energy dropdown that lowered the bar for "tired" was
removed for exactly this reason: it made Tuesday's 70 incomparable with
Monday's, and comparable history is the only durable asset here. Energy is
recorded and colours the *interpretation* — never the measurement.

**Metadata only, always.** `output.rs` reads sizes, mtimes, names and git counts.
It never opens a file, never reads content, never logs keystrokes. If a signal
cannot be had from `stat`, it is not gathered.

**Models propose; they never decide alone.** Anything a language model returns
passes through `normalizeContract` / `normalizePlan` first. Models return prose,
markdown fences, snake_case, invented enums, inverted ranges and 200-item lists.
None of that may reach the rest of the app. A model may also never set a
duration — session length comes from the user's measured history.

**The user's explicit rule outranks any inference.** Their own blocklist wins
over any model's opinion about their goal.

**Aggregate before a model sees a session.** `sessionVerdict.js`'s
`buildVerdictInput()` is where cost and privacy turn out to be the same
boundary. A raw session record is ~33,000 tokens and ~92% of that is the
per-second `timeline` — data a model cannot use and would be billed for.
Aggregating first brings it to ~1,200: a 27x cost difference, larger than the
gap between the cheapest and most expensive model. The fields dropped for cost
are exactly the ones carrying private content — window titles (`label`),
title-derived artifact names (`byArtifact`), the watched folder path (`root`),
changed file names (`changedNames`). What survives is app names, bare
hostnames, durations and counts. Two test blocks nail this down; both were
verified to fail when the leak is reintroduced. Do not enrich that payload
without reading them.

**A model that cannot judge says nothing.** `deriveVerdict()` returns null on
the `keywords` provider rather than a cheap verdict, because keyword matching
cannot weigh "40 minutes in Figma" against "write the intro chapter". Null is
also what an absent model, a thin session and a failed call return — the end
screen renders nothing in every case. An absent verdict costs the user nothing;
a fabricated one costs trust.

### The one thing that leaves the device

Goal understanding is **opt-in and off by default** (`keywords` provider). The
`local` provider may receive the explicit session name, plan and tags, but it
runs through Ollama on the same device. The `cloud` provider sends only the
trimmed, bounded text from “Definition of plan” — never the session name, tags,
activity log, window titles or file names — and sends nothing when that field is
empty. Tests pin both boundaries. Keep them that way.

All three providers are async, return the identical shape, and **fall back to
`keywords`** on any failure. A model that is absent, slow or talking nonsense
degrades the result; it never breaks a session.

---

## 6. Already tried and rejected — do not rebuild

- **Projects / multi-session plans.** A full "plan a project → steps → next-up
  card → optimization phase" arc was built and reverted at the user's request
  (see the revert commit). Do not propose it again without him raising it.
- **Two design directions** (a stoic session screen, a cinematic landing page)
  were rejected outright. **Do not invent visual directions.** The current one —
  ultramarine, dark, one accent — was chosen by him explicitly.
- **Energy-adjusted scoring thresholds.** Removed on purpose; see §5.
- **B2B employee monitoring.** A legal dead end: EU AI Act Article 5(1)(f)
  prohibits emotion recognition in the workplace, and Austrian §96 ArbVG
  requires works-council consent. Stay consumer.
- **A camera pre-flight before MediaPipe.** Acquiring and releasing a stream just
  before MediaPipe reacquires it risks a `NotReadableError` race on real
  hardware. Reverted.
- **Questions during a session** (thought probes, "were you on task?",
  in-session check-ins). Rejected 6 Oct 2026, even as a way to validate the
  score: a running session is never interrupted with a prompt. Validation uses
  the post-session check-in or data already collected. The existing alerts for
  real distraction are separate behaviour.

---

## 7. Testing and verification

There are currently 1001 JS tests and 84 Rust tests (14 native-camera library
tests plus 70 app tests). Both suites must stay green. Treat these counts as a
checkpoint, not a substitute for reading the runner output when tests are added.

Test the **refusals and the boundaries**, not just the happy path. The valuable
tests here assert that the code stays quiet on thin data, rejects malformed model
output, and survives records written before a field existed.

The dated release-gate evidence and its still-open manual/credentialed checks
live in [`docs/release-readiness-2026-09-02.md`](docs/release-readiness-2026-09-02.md).
Update that record instead of creating a second unlinked launch checklist.

**A green build is not verification.** The live-session camera is native, so
`npm run dev` and a browser `getUserMedia` stub cannot exercise it. Use the
internal native diagnostic for frame flow and the installed app with a real
camera for scoring, minimize and close/hide behavior. The camera-less build
machine can run the recorded-frame parity harness, not the live-camera test.

---

## 8. Working with Clemens

- **He wants blunt honesty**, including about business decisions. He has asked
  for it explicitly. Do not soften a real problem.
- **Show the smallest working thing early.** The rejected project feature was
  three layers deep before he saw it. He approved a *description*, which is not
  the same as approving the thing. Build one usable slice, show it, then
  continue.
- **Never guess at visual taste.** Ask for a reference or a concrete direction.
- **He writes German; the codebase and commits are English.** Replying in German
  is welcome.
- **Do not kill the running companion** without checking the native Protection
  screen for an inactive session and disabled app/website blocking first, and
  say so before you do.

### Commits

Explain *why*, not what — the diff already says what. Name the failure mode the
change prevents. Note anything a later agent would otherwise rediscover. End
with your own attribution trailer.

Workflow changes may be prepared by any agent, but must not be pushed or merged
without explicit review by Clemens or the designated workflow owner. Production
publication must use a protected GitHub Environment with manual approval.

---

## 9. Current state (August 2026)

Working and verified: ultramarine design across the app, motion layer with
`prefers-reduced-motion`, real 2D gaze tracking, camera fault detection and
sleep/wake recovery, bundled offline MediaPipe, artifact tracking, output
evidence in Rust, personal calibration, switchable goal-understanding providers.
CI runs the unit tests on every push to `main` that matches
`companion-test.yml`'s path filter (job `test-build`, step "Run unit tests") —
confirmed green 11 Aug 2026. A docs-only or otherwise excluded push runs no
suite and does not move `internal-test`.

Open, in rough priority order:

1. **Real usage.** Calibration stays silent below 8 sessions and output evidence
   needs a nominated folder. Several features cannot be judged until they have
   data. This matters more than the next feature. As of 11 Aug 2026 the stored
   history holds ten sessions, none newer than 4 Aug — which is why a scoring
   regression sat unnoticed for five days.
2. **Impressum address.** `LegalModal.jsx` carries a `TODO(legal)`: § 5 ECG
   requires a geographic address (street, number, postcode) and "Wien,
   Österreich" is not one. Only Clemens can supply it. Launch blocker.
3. **Apple Developer Program** (€99/yr, individual — no company needed). Until
   then builds are ad-hoc signed and Gatekeeper warns on first launch. The
   signing pipeline is already written and waiting on six `APPLE_*` secrets.
4. **Splitting `SessionScreen.jsx`** — after launch, not before.
5. **Windows port** — architecturally feasible (the Rust is ~1600 lines and
   macOS-specific only at the edges; the hosts-file technique is identical). The
   hard part is reading browser URLs without AppleScript. Wait for demand.

Product weaknesses found 11 Aug 2026. Both were decided on 6 Oct 2026: blocking
is no longer treated as the differentiator (§1), and re-engagement is built on
the comparison layer in §11 (baseline, records, weekly review):

- **The differentiator ships off.** A new user sees "0 focus apps · 0 blocked".
  Blocking is the one thing competitors lack, and it is empty by default, behind
  a config screen and an admin password. Most users will never see it work.
- **Nothing brings the user back.** There was no notification, reminder or
  scheduling anywhere in the codebase. Addressed 6 Oct 2026 by the comparison
  layer and the weekly notification (§11).

---

## 10. Camera measurement architecture — decided 29 Aug 2026

**Read this before touching anything camera-related. It ends a chain of four
failed fixes.**

### The finding

Background attention measurement cannot be built on `getUserMedia` inside the
WebView on macOS. Not "is buggy" — cannot.

- macOS **does** allow background camera capture. The green camera indicator
  stays lit while the window is minimized, and the iOS-style restrictions
  (`videoDeviceNotAvailableInBackground`, the `multitasking-camera-access`
  entitlement) are iOS-only concepts. Zoom, OBS and Photo Booth capture while
  backgrounded.
- **WKWebView** is what stops delivering frames once its view is not in a
  visible window. Apple's own forum guidance is explicit that native capture
  keeps working in the background while the WebView's does not, and the iOS
  workaround (`UIBackgroundModes`) has no macOS equivalent.
- Observable signature: the track stays `readyState === 'live'` and
  `video.readyState` stays 4, but WebKit stops decoding, so the element hands
  out **the same frozen frame forever**. MediaPipe returns identical landmarks
  every time, producing a flat, confident score for a user who has walked away.

### What was tried and did not fix it — do not retry

- `28be656` — native `CloseRequested` uses `minimize()` instead of `hide()`.
  Worth keeping (a hidden window is fully unmapped), but not the cause.
- `de67f03` — App Nap exemption via `NSProcessInfo` activity token, held while
  a session is active or paused. Worth keeping, not the cause.
- `7f645a5` — `"backgroundThrottling": "disabled"` (WebKit
  `inactiveSchedulingPolicy = none`). **Tested on macOS 15.7.3: no effect.** It
  governs task scheduling, not the capture pipeline.
- `ea2bdfc` — stale-frame guard: `video.currentTime` was watched, and a picture
  frozen for over a second was no longer fed to MediaPipe. It was load-bearing
  while the WebView source existed. Native V2 replaces it with a one-second
  AVFoundation frame heartbeat; that equivalent honesty guard is now
  load-bearing. Removing it silently reintroduces fabricated focus time.

### The decision

Camera capture and landmark inference move into the native Rust process
(AVFoundation + the **same** MediaPipe TFLite models). The WebView becomes
display only. Rationale for using the same models rather than Apple Vision:

- Vision gives 76 landmarks and one pupil point per eye; MediaPipe with
  `refineLandmarks: true` gives 468 landmarks plus five iris points per eye.
- Every scoring constant, the gaze geometry and the yaw/iris sign conventions
  (§4.7) are tuned to MediaPipe's geometry, several with research citations.
- Above all, §5's *"One ruler, every day"*: changing the landmark engine changes
  the ruler and makes all existing history incomparable.

Feeding native frames into the WebView so MediaPipe.js could stay was
considered and rejected: measurement would still depend on WebKit keeping JS
alive while hidden, which is the exact class of dependency that caused this.

### The parity result and replacement gate

The original main risk was preprocessing (ROI crop, rotation and scale before
landmark inference): a slight mismatch shifts every coordinate and silently
changes tuned thresholds. The parity work also proved that identical weights do
not guarantee identical output across WebGL and CPU execution backends.

Parity was measured on identical recorded frames, reporting mean/p95/max for
landmark delta, pose, per-frame score and `FOCUSED_SCORE` classification. Native
V2 reached 97.2806%, below the proposed 99% classification gate. It is not and
must never be presented as V1 parity.

The same isolation showed FaceMesh.js WebGL does not meet those score and
classification gates against FaceMesh.js CPU. Clemens explicitly delegated the
parity-gate decision to Codex on 1 Sep 2026; Codex retired the fixed WebGL 99%
gate as a promotion gate because the historical execution backend is not a
stable reference implementation. Keep the harness, failed numbers and
model/sign checks as characterization and regression evidence.

The replacement gate is: every new session explicitly records its pinned model
hashes and attention-scoring generation; no daily score, trend bucket or pattern mixes generations; missing
native frames remain absent measurement; and the real minimize/close score test
passes. This is a versioned ruler migration, not a claim of equality.

`SCOREABLE_SCORING_VERSIONS` includes V1 through V5 but refuses a missing version.
Per day, `calculateDailyFocus` uses the highest generation present.
`comparableSessions()` narrows cross-session comparisons to the most recently
used generation. Earlier history remains stored and readable, but is excluded
from current-generation comparisons. Users therefore need eight usable V4
sessions before patterns speak again. Do not bypass that silence by blending
generations.

Since 7 Oct 2026, new sessions use the same pinned native V2 camera/models with
`attentionScoringVersion: 4`. V4 retains V3's earned-top ceiling but is a new
scoring-ruler boundary, not a camera-model upgrade: it removes absolute blink-rate rewards/penalties, mouth-opening/yawn
penalties, webcam pseudo-PERCLOS and the unsupported post-distraction ramp
slowdown. Only sustained eye closure remains, measured relative to the user's
calibrated open-eye EAR and held for 1.5 s. The 0.55 ratio and hold are
conservative product boundaries, not claims of diagnosing fatigue. The evidence
and rejected interpretations are in
`docs/focus-score-evidence-2026-10-07.md`. V3 history keeps the earned-top
scale with the older ocular rules; it is readable but never blended into V4.

Since the same day, new sessions use `attentionScoringVersion: 5`: V4's signals
unchanged, with the earned top reworked (§4.11) after a live session under
V3/V4 never got past ~80. V4 sessions remain readable and are not blended into
V5.

### Native V2 status (1 Sep 2026)

Native V2 is the **only** live-session source in every native build. The old
WebView `getUserMedia`/FaceMesh.js session path and its preference toggle are
removed:

- `AVCaptureSession` delivers 640×480 BGRA buffers to a bounded native queue.
  Rust immediately copies them to in-memory RGB; no live frame is written to
  disk or sent over IPC.
- The models are byte slices from the exact `@mediapipe/face_mesh`
  `0.4.1633559619` packed asset already used by the WebView: short-range face
  detector plus `face_landmark_with_attention.tflite` (478 points). Do not
  replace them with a modern Face Landmarker `.task`: its 256×256 unified-output
  graph is not the same model contract.
- The attention graph needs MediaPipe's three custom TFLite ops
  (`Landmarks2TransformMatrix`, `TransformTensorBilinear`,
  `TransformLandmarks`). The native loader registers the official V2 ops from
  the pinned MediaPipe 0.10.35 arm64 library. That library is verified and
  bundled at build time; the installed app never downloads it at runtime.
- Detector letterboxing, weighted NMS, detection/landmark ROI tracking,
  192×192 rotated crop, attention-region refinement and full-image projection
  are native. There is no horizontal mirror in preprocessing. The resulting
  signs are held by tests: `yawSigned > 0` is head-left and `irisH > 0` is
  eyes-right.
- Only landmarks/status cross Tauri events. If AVFoundation delivers no new
  buffer for one second, the native ROI is reset and status becomes
  `faulted/no_frames`; no previous landmarks are replayed.

The underlying compatibility commands remain `start_native_camera_prototype`,
`stop_native_camera_prototype`, and `get_native_camera_status`; events are
`native-camera-landmarks` and `native-camera-status`. Internal-test/dev builds
show a start/stop/frame-counter diagnostic on Protection, but it cannot change
the session source. Leaving that screen stops the diagnostic before a session
claims the camera. Native landmarks feed the unchanged JavaScript scorer
through Tauri events; live pixels never cross IPC.

On 29 Aug 2026 Clemens verified this prototype on the target MacBook Air: the
native frame sequence continued advancing both while the window was yellow-
minimized and while it was red-closed/hidden, until he pressed Stop. This passes
the Step 1 native-lifecycle test. At that point it did **not** verify the V2 live
session score; the later result is recorded below.

On 31 Aug 2026 Clemens then verified the opt-in V2 live session on that MacBook:
the score/timeline changed after deliberate movement and looking away during
both yellow minimize and red close/hide, no window action created a pause or
manual-resume requirement, and the saved debrief identified the native V2
ruler. This passes the live minimize/close gate. It does not cover hard camera
loss, system sleep/lid close, or CPU/energy impact; keep those claims open.

V2 renders its live preview with a native `AVCaptureVideoPreviewLayer` sharing
the existing `AVCaptureSession`. React sends only the placeholder's geometry
through the `set_native_camera_preview` command; preview pixels are never
serialized or emitted into the WebView. Preview-layer failure is presentation
only and must not fault otherwise valid landmark measurement. Do not replace
this with frame bytes, data URLs, canvas copies, or a second capture session.

The harness must remain a Cargo `example`, not a `src/bin` target: Tauri tries
to bundle extra binaries and can select the wrong app executable.
`Cargo.toml` also keeps `default-run = "eudonomia-companion"` so no future
auxiliary target can silently become the app executable.

The recorded-frame tools are:

```bash
cargo run --manifest-path companion/src-tauri/Cargo.toml \
  --example native_camera_reference -- <frames-dir> <native.jsonl>
# Optional ROI isolation only:
# append --roi-oracle <facemesh-js-cpu.jsonl>
# Run npm dev, open /native-camera-parity.html, select the same directory and
# GPU/WebGL. CPU is an explicit backend diagnostic, not the historical ruler.
npm run camera:parity:compare -- <facemesh-js.jsonl> <native.jsonl>
```

The comparator replays both landmark streams through the same camera-only JS
scorer. Clemens' 4:51 / 4,376-frame run on 30 Aug 2026 **failed** the fixed
gate: landmark mean/p95/max `0.001283/0.004537/0.088413`, yaw p95 `2.311°`,
pitch p95 `0.627°`, score p95 `6.799`, and focused-classification parity
`97.2806%` (119 mismatches). Replicated landmark-crop borders match the legacy
graph and improved the result, but lossless PNG, isolated re-detection, Metal,
WebGL-mediump emulation and PNG colour-profile normalization did not close the
remaining gap. Further full-clip isolation proved that the exact v0.8.8 CPU
runtime is effectively identical to the pinned v0.10.35 native runtime, that
driving native tracking from the preceding JS landmarks barely changes the
failure, and that FaceMesh.js WebGL versus FaceMesh.js CPU itself misses the
score/classification gates (`4.000` p95, `98.8574%`). Identical weights do not
make execution backends interchangeable. Full numbers and eliminated
hypotheses are in
`docs/native-camera-prototype.md`. The failed parity is why V2 must stay
versioned. The live minimize/close gate has since passed as recorded above;
CPU/battery and hard camera-removal tests remain outstanding. Do not claim
those separate boundaries have passed.

That real-use confirmation completed migration Step 5. On 1 Sep 2026 the
WebView live-session camera path and source toggle were removed. Visible
onboarding/workspace calibration and the explicit recorded-frame parity harness
may still use WebView camera/FaceMesh code; they are not session measurement.

### Verifying it — the traps that already cost real time

- **A green build proves nothing here.** The decisive test is: start a session,
  fixate, note the score, minimize, deliberately look away and move around for
  ~2 min, reopen. **The score must have changed.** A flat line means unfixed.
  This was reported as fixed three times before that test was actually run.
- **Two machines.** Builds happen on a Mac Mini, which has **no camera**. The
  test above is impossible there. The parity harness runs on recorded frames and
  needs no camera; the real camera test and the reference-frame recording belong
  to Clemens on his MacBook Air. Never report the camera test as passed from a
  machine that cannot perform it.
- **Do not drive the app with AppleScript/System Events.** The test build and
  the installed app share the process name `eudonomia-companion`, and System
  Events routes clicks by OS focus rather than by the PID addressed — even with
  a distinct bundle identifier. This started two real sessions in Clemens'
  production app during the investigation. Test manually.
- **Check the release channel before claiming something is live.** Confirm the
  assets under the `internal-test` tag are actually new and that Clemens sees
  the matching build id. Testing against the wrong build has happened more than
  once (§2).

---

## 11. The metric system — decided 6 Oct 2026

What the user is shown, and the rules that keep it honest. Names matter: a
metric's name is a promise about what it measures. The camera sees overt visual
behaviour (eyes/head toward configured work zones and sustained eyelid closure),
not covert thought, so nothing user-facing may claim more than that. Blink rate
and yawning are not score inputs.

### Measures

| Measure | Definition | Source |
|---|---|---|
| **Deep Focus** (volume) | Exact Flow time, `flowSeconds` with `deepFocusTimeVersion: 2` | live Flow gate |
| **Lapses per hour** (stability) | Entries into a stretch of ≥ 10 s (two consecutive 5 s timeline samples) below `FOCUSED_SCORE`, per measured hour | timeline |
| **Recovery time** (stability) | Median time from the start of a lapse until attention is back at ≥ `FOCUSED_SCORE` for ≥ 10 s; a lapse cut off by a break, gap or the session end is left out | timeline |
| **Context switches per hour** | Changes of work context (app, plus site in a browser) where each side holds ≥ 10 s, per measured hour. Needs `activity.app` on every sample, recorded since 6 Oct 2026; the older `label` is the window title and changes with every file or page | timeline `activity` |
| **Longest Deep Focus block** | Longest run of consecutive `deepFocused` samples plus the 90 s qualifying warm-up when `inFlow` proves that run opened a new Flow span | timeline |
| **Average attention** | Mean score over measured seconds — a supporting number and the Focus Score's quality input, not a headline. The part above 75 has to be earned with time in the Deep Focus band (§4.11), so a clean short session averages around 80, not the high 90s | ledger |
| **Session time** | Active session time without breaks (was labelled "Focus time"; it is not focused time) | `actualSeconds` |
| **Focus Score** | The daily ring, unchanged (§4.9): volume × attention quality | ledger |

Removed from user-facing screens (still stored and in the CSV): "Focused time"
and "Time above threshold". They duplicated average attention and Deep Focus
under confusingly similar names.

Rules:

- **The Flow gate is frozen**: 90 s qualified entry, score ≥ `FLOW_SCORE`, 5 s
  interruption debounce. The Focus Score pays a 25 % bonus on it, so changing
  the gate silently re-rules every score. If longer blocks matter later, add a
  derived count ("Deep Focus blocks ≥ 20 min") from the timeline instead.
- **Derived measures come from the stored 5 s timeline** (`sessionMeasures.js`),
  never from new live logic. Nothing is counted across a break or camera gap,
  and per-hour rates need 5 measured minutes. Their 5 s granularity is stated,
  not hidden. The longest block includes the same successfully qualified 90 s
  warm-up already credited in `flowSeconds`; it adds that credit only where
  `inFlow` proves a new entry, never after a retained interruption. Historical
  samples without gate state stay unknown rather than being guessed.
- **Every count has a hold time** (invariant 2): one 5 s sample never makes a
  lapse or a switch.
- **The live session shows Deep Focus, not phase names.** Lock-in (a 4-minute
  streak at the focused threshold) and Deep Focus (score ≥ 72 after the gate)
  are two different "locked in" ideas; showing both live made users ask which
  one counts. Phases stay as an analysis lens in the debrief.

### Energy

Before #64 (6 Oct 2026) quick start silently stored `energyLevel: 'medium'`
and reused setups copied old answers. Those values cannot be told apart from
real ones. Sessions saved since carry `energyLevelVersion: 2`, meaning energy
is either a real answer or `null` (not asked). **Energy analysis uses only
sessions with that marker.** Older sessions keep their stored value and are
never rewritten.

### Comparison layer

- **Personal baseline** (`personalBaseline.js`, Lab day view): a day against
  the user's own usual — the median of the previous 28 days that have a
  current Focus Score on the current camera generation, silent below 5 such
  days. Rest days are left out, not counted as zero. Today is still running,
  so cumulative values (score, Deep Focus) show the usual as a reference, not
  a gap that would read as a deficit every morning; average attention is
  compared at any time. Gains are green, shortfalls stay neutral. Session
  time gets no usual: more hours is not better work. Never against other
  people.
- **Personal records** (`personalRecords.js`): longest Deep Focus block, most
  Deep Focus in a day, best Focus Score day. A qualifying session is on the
  current generation, not faulted, ≥ 5 measured minutes, with exact Deep
  Focus. Nothing is claimed below 10 qualifying sessions — before that nearly
  every session is a "record" and the word stops meaning anything. The
  debrief announces a record only from the session that set it (a day record
  only from the session that pushed the day past the previous best), and only
  once history has loaded. Day scores are ranked unrounded but announced only
  when the shown number rises. Analytics → Overview lists the standing
  records, or "n of 10" progress.
- **Weekly review** (`weeklyReview.js`, `WeekReview.jsx`): the Lab's Weekly
  view shows the week against the one before — Deep Focus, average attention,
  lapses per hour, best day — and any records set that week. A running week
  shows last week beside cumulative values, never a gap. Weeks on different
  camera generations are not compared. The day view offers last week's review
  once ("Your review of last week is ready"), until the user opens it.
- **The one notification** (`App.jsx`, `tauri-plugin-notification`): "Your
  week in review" with a one-line Deep Focus summary, once per week, only when
  last week had a qualifying session, from 08:00 Monday to the end of
  Wednesday, never during a session. The week is remembered only after the
  native side accepted the send. It goes through the plugin, not AppleScript:
  an AppleScript notification opens Script Editor when clicked. The plugin is
  pinned to `~2.4` because 2.5 requires tauri 2.12; move it with the next
  deliberate tauri update, not as a side effect.
