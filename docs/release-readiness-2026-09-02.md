# Release-readiness evidence — 2 September 2026

> **Superseded status (3 October 2026):** the Apple Developer credentials and
> current release pipeline described below as missing have since been exercised
> successfully. Signed app and DMG notarization/stapling, Gatekeeper, arm64, and
> updater-signature gates passed in internal run `36935503351`, non-publishing
> production dry-run `37110105602`, and the post-rename signed run
> `37111408775`. No public production release was created. The historical
> entries below remain as dated evidence and must not be read as current status.

This is a point-in-time checklist for commit `ab3a07fb4e28a7316a63ef9b6a70406c11e3e17f` (`ab3a07f`). It records what was verified from the Mac Mini/build worktree and what still requires a real target Mac, a human decision, or protected release credentials. The durable product constraints and owner-held blockers remain in [`AGENTS.md`](../AGENTS.md); this dated record supplies evidence rather than replacing that source.

Rechecked on 7 September 2026: `origin/main` was still `ab3a07f`, the latest internal CI run and updater assets were unchanged, the production release was still `companion-v0.1.10`, and the 442-test JavaScript suite passed again. A workflow/config regression test was then added on this branch, bringing its local suite to 443 tests. The open gates below therefore remain current.

## Evidence collected

| Gate | Result | Evidence |
| --- | --- | --- |
| Worktree synchronization | Pass with caveat | Worktree was clean and `HEAD` matched `origin/main` at `ab3a07f`. `git pull --ff-only` could not run because this local branch has no upstream configured; no merge was attempted. |
| JavaScript tests | Pass | `npm test -- --reporter=dot`: 37 test files, 442 tests passed. |
| Web production build | Pass | `npm run build` completed successfully. Existing warnings: non-module MediaPipe script tags and two chunks over 500 kB. |
| Latest CI test/build | Pass | GitHub Actions run `33537175187`, Test Companion, commit `ab3a07f`, completed successfully. Its unit tests, Rust tests, companion UI refresh/verification, updater-secret check, arm64 build, artifact upload, and internal-channel publication steps all passed. |
| Internal updater channel | Pass/current | `internal-test/latest.json` is version `0.1.2609011731`, published 2026-09-01 17:36 UTC, and names commit `ab3a07f` in its notes. This internal manifest advertises only `darwin-aarch64` and has a non-empty signature; that does not verify the independently generated production manifest. |
| Native Rust checks on this machine | Pass | The Cargo proxy exists outside the shell `PATH`. `~/.cargo/bin/cargo check` completed successfully, and `~/.cargo/bin/cargo test` passed 13 library plus 59 app tests (72 total). |
| Checked-in companion bundle | Not applicable without a prior refresh | Generated MediaPipe runtime files are intentionally uncommitted. On a fresh checkout, `npm run refresh:companion-webui` must run before `npm run verify:companion-webui`; CI performs both steps successfully. |

## Release blockers and open verification

### Human-owned blockers

- The Impressum still needs Clemens' geographic address (street, number, postcode, and `Wien, Österreich`), as required by Austrian ECG §5. Do not invent or publish a placeholder.
- Apple Developer Program enrollment and release credentials remain required for a public signed/notarized build: Developer ID certificate, notarization account/app-specific password/team ID, and Tauri updater signing key. Secret presence cannot be verified from this worktree.
- A nominated output-watch folder is required before output evidence can be judged in real use.

### Hardware/manual gates

- The native V2 minimize/close live-session gate is recorded as passed on the target MacBook Air on 31 August. This worktree cannot independently reproduce it.
- Hard camera removal, sleep/lid-close recovery, CPU/energy impact, and a clean first-run permission path remain unverified here. They require the target Apple Silicon Mac and manual interaction; do not infer them from CI.
- The recorded-frame parity harness remains characterization/regression evidence. Native V2 is a versioned ruler, not a claim of V1/WebGL parity.

### Production release pipeline

- The successful CI evidence above is from `companion-test.yml`, not the signed production pipeline. `companion-release.yml` has not run since 16 July 2026; its seven most recent runs failed, and its last successful run predates the current arm64 target and bundle-path changes. No `release-v*` tag exists, so the current tag trigger has never exercised this workflow. Signing, notarization, stapling, Gatekeeper assessment, production updater generation, and final publication therefore remain a release blocker rather than a routine last step.
- The internal workflow asserts a single `darwin-aarch64` updater target. The current production manifest contains only the arm64 labels `darwin-aarch64` and `darwin-aarch64-app`, but it predates the native camera migration. The production workflow generates its manifest separately through `tauri-action`, has no equivalent platform assertion, and never checks the built executable with `lipo`; the next public build can therefore regress the arm64-only contract without a release gate catching it.
- `workflow_dispatch` is not a safe dry-run path in its current form: after verification it reaches the same `Publish verified release` step and marks the release public/latest. Before the first production attempt, the workflow needs an authorized non-publishing validation path, or the release owner must explicitly treat the run as a live publication. Workflow ownership stays with Stony.

## Channel warning

The production updater manifest is still `0.1.10`, published 16 July 2026, while the internal channel is current through `ab3a07f`. The checked-in base config points at `internal-test`; the production config points at `releases/latest`. Therefore a tester must confirm the installed build's channel and build badge before expecting this commit to appear. Its version and platform shape are historical evidence, not proof that the current production workflow works. No production release was created or published during this audit.

## Safe next actions

1. On a target MacBook Air, manually run the hard camera-loss, sleep/wake, permission, and resource-impact checks and attach dated evidence.
2. Supply the legal address and complete Apple Developer/release-secret setup.
3. On a clean checkout, run `npm ci`, `npm test`, `npm run refresh:companion-webui`, `npm run verify:companion-webui`, `~/.cargo/bin/cargo test --manifest-path companion/src-tauri/Cargo.toml`, and the arm64 release build; inspect the build badge and updater channel before installation.
4. Before creating a real tag, have the workflow owner add or authorize a non-publishing production validation path, then exercise the current signing/notarization/arm64 packaging flow and inspect its draft plus updater manifest without promoting it.
5. Only after those gates pass should an authorized release owner create a `release-v*` tag and publish the signed production release.

## Focus Score audit — 15 September 2026

Local changes based on `702225a` clarify measured-day averages, independently
show today's measurement status, fix calendar refresh, and reject future or
invalid rollup contributions. The [audit](focus-score-audit-2026-09-15.md) records
the formula, reproducible examples and remaining V1 design limits, including
the phase-weight discontinuity. A replacement V2 formula remains a product
decision; this change does not silently rescore existing V1 days.

- `npm test -- --reporter=dot`: 58 files, 663 tests passed, including rendered
  Lab/Analytics regressions for the 72 example and midnight rollover.
- `npm run build`: passed; existing MediaPipe script and large-chunk warnings
  remain. Build success does not establish native camera behavior.
- `cargo test --manifest-path companion/src-tauri/Cargo.toml`: 13 library and
  67 app tests passed (80 total). No native source was changed.
- Visual browser inspection could not run: the Browser runtime reported no
  available browser and discovery returned an empty list. Component behavior
  was verified in jsdom; final layout remains unverified in the native WebView.
- No installed app was replaced, no live session was started, and no channel
  was published or checked for freshness. These results describe local code.

## Focus Metric V2 — 16 September 2026

After Clemens chose work time, quality and consistency as the intended composite,
V2 was implemented locally on top of `fee1da0`. The [updated audit and
specification](focus-score-audit-2026-09-15.md#v2-specification) records the exact
formula, product estimates, historical-data policy and remaining limits.

- Lab and Analytics default to explicitly labelled V2. The V1 formula remains
  selectable. Both use the same qualified raw ledger, without rewriting saved
  V1 records or mixing camera generations. V1 baselines are excluded from V2.
- At equal time, higher attention improves the unrounded score. Time has
  diminishing returns; zero-attention padding cannot improve it. The old phase
  inversion is reproduced in V1 and eliminated in V2 by dedicated tests.
- A dated workday plan supplies consistency. The visible Mon–Fri default starts
  at setup, changes apply tomorrow, and missing past plans are not invented.
  Tests cover the 72→72 Tuesday morning→63 Wednesday example, weekends, unknown
  measurement, persistence, failed writes and historical plan preservation.
- Full JSON exports include the dated plan from both repository adapters and
  Analytics, verified by pipeline and native-adapter tests.
- `npm test -- --reporter=dot`: **60 files, 692 tests passed**.
- `cargo test --manifest-path companion/src-tauri/Cargo.toml`: **13 library +
  67 app tests passed**. Native camera/scoring source was unchanged.
- `npm run build` and `git diff --check`: passed. Existing MediaPipe/non-module,
  chunk-size and test-environment warnings remain.
- Browser setup was retried and still reported `No browser is available`;
  discovery returned `[]`. Visual layout in the native WebView is unverified.
- No installed app replacement, live camera test, push, updater-channel change
  or release publication was performed. This is verified local implementation,
  not evidence that the installed application has received V2.

## Deep Focus time — 22 September 2026

Clemens rejected the V2 composite after real use because it awarded an
easy-looking 72 to two hours at attention 80 and preferred absolute Deep Focus
time to a percentage-like score. The active Lab and session report now use a
new exact `flowSeconds` accumulator as their primary result. Work duration,
attention quality and consistency remain separate supporting facts instead of
being collapsed into one number.

- Deep Focus grows only while the existing live Flow state is active and the
  score remains at least 72. The 90-second entry gate is not counted.
- `deepFocusTimeVersion: 1` distinguishes the exact accumulator from the loose
  threshold in `focusedSeconds` and V1's weighted `deepFocusSeconds` estimate.
- Historical sessions without that field remain unavailable; no percentage or
  phase estimate is relabelled as literal time.
- The active Lab no longer offers V1/V2 score switching. The old score module
  and historical analysis component remain intact so saved history is not
  silently reinterpreted.
- `npm test -- --run`: **64 files, 717 tests passed**. New boundaries cover the
  Flow gate, invalid/legacy time, partial history coverage, the Lab headline,
  post-session report, Analytics cohort comparison and CSV export.
- `npm run build`, `npm run refresh:companion-webui`,
  `npm run verify:companion-webui`, and `git diff --check`: passed. Generated
  local-identity WebView output was not committed; CI refreshes it with the
  release build identity.
- `cargo test --manifest-path companion/src-tauri/Cargo.toml`: **13 library +
  67 app tests passed**. No Rust source changed.
- Browser discovery returned no available browser, so native WebView layout is
  still a manual check. No installed app or live camera session was touched.
- Internal `Test Companion` run **#144** completed successfully for app commit
  `1ae052a`. The `internal-test` tag resolves to that exact commit; its refreshed
  manifest is version `0.1.2609221913`, notes build 144 / `1ae052a`, contains
  only `darwin-aarch64`, and carries a non-empty updater signature. This moves
  the internal channel only; no public release was created.

## Restore V1 headline — 23 September 2026

Real use rejected the Deep-Focus-only Lab because existing history correctly
had no forward-recorded `flowSeconds`, leaving the main readout blank. V1 is
restored as the primary Focus Score. Exact Deep Focus remains a secondary time
value, and historical sessions are still not backfilled from looser counters.
Average attention is used as the numeric fallback in session lists when exact
Deep Focus is unavailable. The stored workday plan remains editable context but
does not alter V1.

- `npm test -- --run`: **64 files, 717 tests passed**. Focused dashboard,
  history-row, cohort, ledger and both metric-generation suites also passed.
- `npm run build`, `npm run refresh:companion-webui`,
  `npm run verify:companion-webui`, and `git diff --check`: passed. Generated
  local-identity WebView output was not committed; CI refreshes it with the
  release build identity.
- `cargo test --manifest-path companion/src-tauri/Cargo.toml`: **13 library +
  67 app tests passed**. No Rust source changed.
- Browser discovery returned no available browser, so native WebView layout is
  still a manual check. No installed app or live camera session was touched.
- Internal `Test Companion` run **#145** completed successfully for app commit
  `eb11525`. The `internal-test` tag resolves to that exact commit; its refreshed
  manifest is version `0.1.2609231659`, notes build 145 / `eb11525`, contains
  only `darwin-aarch64`, and carries a non-empty updater signature. This moves
  the internal channel only; no public release was created.

## Explain unavailable Deep Focus — 23 September 2026

The Lab's Deep Focus metric now distinguishes exact `0s` from unavailable
history and explains the unavailable state instead of showing an unexplained
dash. It continues to refuse estimates from the looser historical counters.

- `npm test -- --run`: **64 files, 718 tests passed**.
- `npm run build`, `npm run refresh:companion-webui`,
  `npm run verify:companion-webui`, and `git diff --check`: passed. Generated
  local-identity WebView output was not committed.
- `cargo test --manifest-path companion/src-tauri/Cargo.toml`: **13 library +
  67 app tests passed**. No Rust source changed.
- Browser discovery returned no available browser, so native WebView layout is
  still a manual check. No installed app or live camera session was touched.
- Internal `Test Companion` run **#146** completed successfully for app commit
  `a5dd314`. The `internal-test` tag resolves to that exact commit; its refreshed
  manifest is version `0.1.2609231718`, notes build 146 / `a5dd314`, contains
  only `darwin-aarch64`, and carries a non-empty updater signature. This moves
  the internal channel only; no public release was created.

## Make the Deep Focus gate attainable — 24 September 2026

The original 90-second gate reset on a single unqualified landmark frame, so
ordinary native-camera jitter could keep Deep Focus at zero indefinitely. The
gate now tolerates up to 1.5 seconds of interruption without counting that time,
then resets on a sustained interruption. The live session exposes both the
warm-up progress and accumulated Deep Focus time.

- `npm test -- --run`: **64 files, 722 tests passed**. New tests pin the
  90-second entry gate, brief-noise tolerance, sustained-interruption reset,
  strict accumulation and live timer wiring.
- `npm run build`, `npm run refresh:companion-webui`,
  `npm run verify:companion-webui`, and `git diff --check`: passed. Generated
  local-identity WebView output was not committed.
- `cargo test --manifest-path companion/src-tauri/Cargo.toml`: **13 library +
  67 app tests passed**. No Rust source changed.
- Browser discovery returned no available browser. The installed Eudaimonai
  app was not running on the camera-less build machine, so the real native
  Flow timer remains a manual MacBook test; no app or session was interrupted.
- Internal `Test Companion` run **#147** completed successfully for app commit
  `ea7b10d`. The `internal-test` tag resolves to that exact commit; its updater
  manifest is version `0.1.2609241553`, notes build 147 / `ea7b10d`, contains
  only `darwin-aarch64`, and carries the expected 440-byte signature. This
  moves the internal channel only; no public release was created.

## Correct partial historical focus time — 24 September 2026

The Lab previously showed the known exact-Flow subset even when the selected
period also contained older sessions without `flowSeconds`. That made a whole
week look like today's two minutes. Period surfaces now use the complete,
versioned V1 phase-weighted Focus time already stored in the ledger. Exact Flow
remains a per-session diagnostic and is not guessed for old records. A selected
historical day can render on its own camera generation; multi-day periods still
use one generation.

- `npm test -- --run`: **64 files, 723 tests passed**. Regression coverage pins
  a two-day period containing only two minutes of exact Flow to the full stored
  period Focus time, and proves a V1 day remains readable after V2 becomes the
  active ruler.
- `npm run build`: passed with the existing MediaPipe/non-module and chunk-size
  warnings.
- `cargo test --manifest-path companion/src-tauri/Cargo.toml`: **13 library +
  67 app tests passed**. No Rust source changed.
- Internal `Test Companion` run **#148** completed successfully for app commit
  `0bbaee1`. The `internal-test` tag resolves to that exact commit; its updater
  manifest is version `0.1.2609242019`, notes build 148 / `0bbaee1`, contains
  only `darwin-aarch64`, and carries the expected 440-byte signature. This
  moves the internal channel only; no public release was created.

## Separate attention quality from time — 26 September 2026

The active Focus Score now reports measured attention quality only. Focus Time
reports active session duration with pauses excluded, while version-2 Deep
Focus reports exact sustained high-attention blocks. Measured time is hidden in
normal operation and surfaces only when coverage falls below 90%. Stored V1/V2
derived scores and version-1 Deep Focus values remain unchanged and are not
reinterpreted.

Deep Focus now credits the qualified 90-second warm-up after successful entry,
tolerates up to five seconds of interruption without counting the gap, and no
longer double-requires head stability outside the attention score. A failed
warm-up still earns nothing, and period totals remain unavailable when any
included session lacks the new exact version.

- `npm test -- --run`: **69 files, 741 tests passed**. New coverage pins the
  duration-independent score, measured-second weighting, camera-generation and
  minimum-duration boundaries, successful warm-up credit, failed warm-up
  refusal, incomplete period refusal and low-coverage warning.
- `npm run build` and `git diff --check`: passed with the existing
  MediaPipe/non-module and chunk-size warnings.
- No Rust source changed. Native camera behaviour and the new five-second
  interruption boundary still require real-use confirmation on the target Mac.

## Quality-gated work Focus Score — 27 September 2026

The active score now combines the three facts Clemens selected: measured Focus
Time is volume, Average Attention scales that volume between the existing alert
and Flow bands, and exact Deep Focus V2 earns a 25% bonus. The period then uses
a bounded Hill curve with an 80-effective-minute midpoint per fixed weekday and
exponent 1.3, which softens micro-sessions before diminishing returns. Raw period
inputs are summed before scoring; daily scores are not averaged.

The ruler starts at the first genuine `deepFocusTimeVersion: 2` contribution.
Older sessions remain outside it, and any missing exact value after the start
refuses the whole selected period. Ledger enrichment copies only exact values
from the source session. Genuine start timestamps separate provably older work
on the cutover day; unknown ordering still refuses. Historical periods wholly
before V4 retain Focus Time without reconstructing a score. Focus Time always
remains the full active clock for the selected period even when V4 can score
only a smaller post-boundary interval; the UI states that difference instead
of making earlier work disappear. V4 uses fixed Monday–Friday weekdays and ignores the
older editable workday plan, preventing users from raising the score by
lowering their own target. Formula, boundaries and remaining calibration estimates are documented in
`docs/focus-score-audit-2026-09-15.md`.

- `npm test`: 71 files, 796 tests passed.
- `npm run build`: passed with the existing non-module MediaPipe and chunk-size
  warnings.
- Rust verification was not runnable in this workspace because `cargo` is not
  installed or available on `PATH`. No Rust source changed.
- No installed app, updater channel or live native camera was changed.

## Apple signing credentials staged — 1 October 2026

Clemens completed Apple Developer Program enrollment and created a Developer
ID Application certificate on the private MacBook. After installing Apple's
official Developer ID G2 intermediate certificate, Keychain reported one valid
code-signing identity. The certificate/private-key pair was exported as a
password-protected PKCS#12 file; its contents and passwords were not shared in
the repository or conversation.

- GitHub reports all six required `APPLE_*` repository-secret names plus
  `TAURI_SIGNING_PRIVATE_KEY`. Secret values remain opaque and have not yet been
  proven by a CI import, signing or notarization attempt.
- A local workflow patch makes manual production dispatch non-publishing by
  default, signs/notarizes the internal channel, verifies `codesign`, Gatekeeper,
  stapling, arm64-only output and the updater signature before publication, and
  adds a stable tester DMG asset. Workflow changes may be prepared by any agent
  but require explicit review by Clemens or the designated workflow owner;
  production publication additionally requires approval through the protected
  `production-release` GitHub Environment.
- `npm test -- --run`: **76 files, 822 tests passed**, including regression
  coverage for the release-channel boundaries. Both workflow files parse as
  YAML, both Tauri overlays parse as JSON, and `git diff --check` passes.
- No public release, internal updater change or installer replacement has
  occurred. Signing, notarization, stapling and clean-machine Gatekeeper
  acceptance remain open until the private validation run succeeds.

## Friends & Family technical fixes — 4 October 2026

A final technical audit on top of `0831319` found and fixed two data-integrity
failures before distribution. This work did not install or replace the running
app and did not publish either release channel.

- Every formerly immediate camera penalty now passes one shared three-frame
  deadzone: brief face loss, possible-phone posture, soft head-down/left/right
  and rolled-up eyes. The first two anomalous frames hold the last trusted score
  and neither earn nor burn the sustained-focus ramp. The recorded-camera replay
  uses the same pure scorer and debounce state as the live session.
- A session insert followed by a failed queued check-in update is now retried
  against the already-created row. Pending edits survive the failure, the UI
  exposes a retry, and the retry cannot create a duplicate session or ledger
  contribution. A later standalone check-in update failure follows the same
  visible retry path.
- `npm run test:coverage`: 85 files and 884 tests passed; coverage gates passed
  at 85.84% statements, 79.33% branches, 89.03% functions and 88.46% lines.
- `npm run lint`, `npm run build`, `cargo check`, 13 native-camera library tests
  and 70 app tests passed. `CI=true npm run build:companion` produced the arm64
  `.app` and DMG successfully. The intentional classic MediaPipe parity script
  no longer emits a Vite warning, and the local-WebView chunk ceiling is explicit.
- The hard camera-loss, sleep/lid-close, clean permission, installed updater and
  CPU/energy gates remain manual checks on the final signed candidate. No claim
  about those gates is inferred from these automated results.

## Beta access in the macOS app (Step 0c): real-hardware validation — 6 October 2026

Build: commit `8628a5e` (PR #71, not merged), `cargo tauri build --bundles app`,
channel `local`, ad-hoc signed, bundle id `ai.eudonomia.companion`, backend
`eudaimonai-staging`. ZIP SHA-256
`b23f1525e666dcd8f173985d3f0314eefd896d3c413ebcfdd4ee6d6e6520ef4c`. Installed
beside, not over, `/Applications/Eudonomia.app` on Clemens' MacBook (real
camera, real history), with the installed app quit.

Before the test: in-app full archive export (96 sessions) and a copy of
`sessions.db`, `-wal`, `-shm` with matching SHA-256 values; the copy reopened
to 96 sessions.

Reported by Clemens after running the build:

| Check | Result |
|---|---|
| Existing history visible after upgrading to the gated build | PASS — 96 sessions |
| Founder sign-in with an emailed 8-digit code against staging | PASS |
| INTERNAL access recognised | PASS |
| Real camera and focus tracking during a session | PASS |
| Session ended normally and saved | PASS — history 97 |
| App restart restores sign-in and access without a new code | PASS — still 97 |
| Sign out | PASS |
| Read-only history after sign-out | PASS — all 97 sessions |
| Starting a new session without access | PASS — blocked |
| Data loss or migration issue | None observed |

Not covered by this run (automated tests only so far): website blocking
during a gated session, the Rust-side camera refusal when invoked directly
from the WebView, offline grace and clock rollback on hardware, access ending
during a running session, and Keychain behaviour of a Developer ID signed
build.

## Focus signal evidence correction — 7 October 2026

Attention scoring generation 4 removes the unsupported absolute blink-rate,
yawn/mouth-opening and pseudo-PERCLOS score effects, personalises the remaining
sustained-closure boundary, and removes the unsupported post-distraction ramp
slowdown. The native V2 camera models and hashes are unchanged. V1/V2 history
and V3's earned-top ruler remain readable and are isolated from V4 comparisons. The longest Deep Focus
block now includes a proven, successfully credited 90-second warm-up without
double-crediting a retained interruption.

- `npm test`: **96 files, 1001 tests passed**.
- `npm run lint`, `npm run build`, and `git diff --check`: passed.
- Rust verification passed despite no Rust source change: **14 native-camera
  library tests and 70 app tests**.
- No installed app or updater channel was changed. The new scoring generation
  still needs one real-camera session on the target Mac to confirm calibration,
  sustained closure and the saved V4 metadata end to end.
