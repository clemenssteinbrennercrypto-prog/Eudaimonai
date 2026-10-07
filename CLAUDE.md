# Eudaimonai — measured focus sessions for macOS

**Read `AGENTS.md` first.** It is the full briefing: what the product is for
(§1), the file map (§3), the scoring invariants (§4), the design principles
(§5), rejected ideas (§6) and the metric system (§11). This file is the short
version plus the invariants every scoring change must re-check.

## What it is

A native macOS app (Tauri 2 + Rust, React UI in the WebView) that measures how
well you actually work — "the WHOOP for cognitive performance". Camera
attention (native AVFoundation + MediaPipe) is infrastructure, not the selling
point; blocking ("Protection") is an optional per-session tool. The voice is an
instrument's, not a guardian's: neutral readouts, no emoji, no scolding, and
never a question during a running session.

Screens (sidebar, ⌘1–⌘5): **Lab** (daily Focus Score ring, attention strip,
quick start) · **Session** (planner) · **Workspace** (desk layout that shapes
gaze scoring) · **Protection** (blocking setups) · **Analytics** (Overview and
Details). A session ends in a debrief with a required outcome check-in.

## Tech stack

- **UI:** React 18 + Vite, plain JSX (no TypeScript), bundled into `companion/webui`
- **Native:** Tauri 2 + Rust in `companion/src-tauri` — camera capture and
  landmark inference, frontmost app/tab, blocking, output evidence, SQLite history
- **Persistence:** SQLite in the native app (`db.rs`); localStorage only for
  settings and in dev
- **Marketing site:** the same Vite build on Vercel shows only `LandingPage`

## Dev commands

```bash
npm install
npm run dev            # isolated UI only — native features unavailable
npm test -- --run      # vitest
npm run lint
npm run build
cargo test --manifest-path companion/src-tauri/Cargo.toml
```

`main` is protected: work lands through a PR, which runs CI.

## Key conventions

- No TypeScript — plain JSX throughout
- `SessionScreen.jsx` is ~2800 lines; prefer extracting pure logic into
  `src/lib/` (with tests) over adding to it
- Scoring constants and score bands live in `src/lib/attention.js`
- `useRef` for all per-frame state to avoid stale closures in the camera callback
- Never report what was not measured: missing camera data is absent, not 0
- One ruler, every day: nothing self-reported may shift a scoring threshold
- No external state management — keep it simple

## Critical invariants — read before touching SessionScreen.jsx

These are real regressions found during review (not hypothetical). Each one
recurred at least once because a later session didn't know it had already
been fixed. Check this list before and after editing scoring/detection logic.

1. **Circadian factor direction.** `getCircadianFactor()` returns a value
   < 1.0 during tired hours (night, post-lunch dip). Tired hours must make
   the alert fire SOONER, not later. That means:
   `adjustedAlertMs = alertDelayMs * circFactor` — multiply, never divide.
   (This exact line was fixed, then reverted by a later refactor, then
   fixed again. If you touch this line, re-read this paragraph first.)

2. **Every penalty needs a hold-time/debounce — no exceptions.** Every
   existing penalty in this file (phone, head-down, head-turn, yawn) only
   fires after a sustained condition: either a `*_HOLD_MS` ref+timestamp
   pattern, or the 3-frame deadzone pattern (`headDownFramesRef`,
   `headTurnLeftFramesRef`, etc.). If you add a new penalty path —
   especially anything based on per-frame classification (gaze direction,
   object proximity, pose) — it MUST use the same pattern before it can
   subtract score. A single bad frame should never trigger a severe (-25
   or worse) penalty. Grep for `HOLD_MS` and `FramesRef` to see the
   existing examples before adding a new one.

3. **No dead-alias variables.** Don't create a new variable that's just
   `= someExistingVar` with a comment explaining a distinction it doesn't
   actually implement (e.g. `earlyMicrosleepMs = eyesClosedMs` was meant to
   be a separate earlier-threshold signal but was identical to the existing
   variable — the guard condition was added later as a fix). If a constant
   like `EARLY_MICROSLEEP_MS` is meant to gate a different condition than
   an existing threshold, the variable computing it must actually encode
   that condition, not just rename an existing one.

4. **Ramp/sustained-state refs must reset on hard state transitions.**
   `sustainedGoodMsRef` (focus ramp) and similar accumulators must be
   zeroed when the underlying state hard-resets — e.g. face fully absent
   (`faceAbsentMs >= FACE_ABSENT_HOLD_MS`). Otherwise an accumulated bonus
   leaks into a score that should be 0.

5. **Before changing a threshold or constant, `git log -S"<constant name>"`
   first.** If it was already tuned with a science citation in a comment,
   understand why before changing it again — don't silently revert a
   previous fix because the current task doesn't need to know about it.

6. **Self-check after editing this file:** scan every line you just
   changed for inversion bugs — `/` vs `*`, `<` vs `>`, `&&` vs `||` — and
   confirm the code's actual behavior matches what the comment next to it
   claims. Most regressions here were a one-character logic inversion that
   still "looked right" at a glance.

7. **Horizontal yaw sign convention.** `analyzeFrame` produces
   `yawSigned > 0` when the head turns to the USER'S LEFT — verified from
   live nose/iris data, and consistent with the head-turn counters
   (`adjustedYawSigned >= yawLT` is the LEFT turn, line ~1222) and with
   `gazeCol`. Any code that maps yaw to a screen SIDE must therefore pair
   positive yaw with a LEFT-side screen. `classifyHorizontalAttention` once
   had this inverted (positive yaw → `productive_right`), so "looking left"
   read as "productively facing the right monitor": it skipped the
   head-turn penalty and even added the `+5` productive bonus for looking
   away. Separately, the iris gaze signal uses the OPPOSITE mirror
   convention (`irisH > 0` = eyes to the user's RIGHT), so "eyes on the
   side monitor you're facing" means yaw and iris have OPPOSITE signs, and
   "eyes wandered off it" means SAME sign — don't "simplify" the eyes-off
   check without re-deriving this from data.

8. **Workspace row convention and calibration authority.** For desk objects
   (pad, book, phone, keyboard, mouse) `row` is DEPTH: 0 = desk edge nearest
   the user. For screens and the webcam it is HEIGHT. The 3D editor's
   `scene.z` runs the other way (1 = nearest), so convert only through
   `rowFromScene` / `sceneFromLegacy` — copying z into row once made every
   near pad invisible to scoring. Objects with a usable calibration target are
   judged by `classifyCalibratedWorkspace` alone; the layout heuristic must not
   re-admit or accuse them (`resolveGazeContext`). Any change to how a
   productive desk object is recognised must be checked against a look into
   the lap: it has to stay a phone posture, not "writing on the pad".

9. **Looking away is priced by distance, not by a fixed amount.** The fixed
   head-turn/eyes-off penalties could not tell 31° from 90°, and the focus
   bonuses outweighed them: a full turn aside held ~71. `offTargetAttention.js`
   scales the whole score (ramp included) by a factor that is exactly 0 inside
   every work zone (screen tolerance box or a recognised work object), grows
   convexly with the degrees outside it (30° = clearly away), and is time
   filtered (second order, 75 % at 4 s like face-absent). Don't add a new
   "looking away" penalty as a fixed amount, and don't widen a work zone
   without an upper bound — an unbounded zone (side screen accepted any yaw
   past 15°) silently disables this.

10. **The top of the scale is earned, and its floor stays above every band.**
    The shown score is `min(signal, earnedTopCeiling(earnedMs))`: 75 at the
    start, 80 after 3 min, 90 after 13 min of Deep Focus band time. A dip
    between 40 and 72 only pauses earning; only a lapse (< 40 for ≥ 10 s,
    leaving the desk included) drains it, and a pause resets it. Never key it
    to the raw pre-ramp score again: that version drained on every glance and
    capped real sessions near 80. Smoothing and holds use `signalScoreRef`,
    not `focusScoreRef`. The floor (75) sits above `FLOW_SCORE` (72), so Deep
    Focus, lapses and phases are unchanged by construction. Never lower it
    below 72, and change floor, half-life or drain only with a new
    `attentionScoringVersion` (currently 5; AGENTS.md §4.11).

## GitHub

https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai
