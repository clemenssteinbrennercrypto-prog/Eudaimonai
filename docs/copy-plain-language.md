# Plain-language copy

Applied on 3 Oct 2026, with these exceptions (still open):

- "AI Companion · Soon" stays in the nav until Clemens decides.
- The Workspace tab is called "Workspace", not "Desk".
- Not applied yet: UNRATED, Search/empty-state strings in Analytics, the
  Protection helper buttons and Automation copy, "Calibrating", "Digital
  environment", "Session reference", "Duration summary".
- "Exact Flow time" became "Deep Focus" in Analytics, since it is the same
  measured value the Lab calls Deep Focus.

Rule from AGENTS.md §5: never claim more than was measured. Each proposal
below says the same thing as the original, or less. Where a plain word would
overstate the data, the note says why it was not used.

## Lab

| Now | Proposal | Note |
|---|---|---|
| COMMAND / LAB (eyebrow) | *(remove)* | The nav already says Lab. Removed in the draft |
| MEASURED SIGNAL / Attention Field | Attention | Subtitle: the period, e.g. "Saturday, 3 Oct" |
| LAST RUNS / Recent Sessions | Recent sessions | |
| Locked In | Protection | Same name as the screen it opens |
| Configure → | Edit | |
| View all → | All sessions | With a chevron icon |
| Active session time · breaks excluded | Time in sessions, without breaks | Test pins the old string; update with it |
| Sustained high-attention blocks | Stretches of 90 s or more of steady attention | Matches the Flow gate (AGENTS.md §4.10). "Flow" alone would overclaim |
| Quality multiplier for measured time | Average while the camera could see you | Says what the number is, not how the formula uses it |
| 86/100 attention (recent session row) | Attention 86 | |
| Unset (outcome) | *(show nothing)* | Applied in the draft, see "Known issues" |
| No signal (legend) | Not measured | Same meaning, user's words |
| Complete a measured session to reveal your attention field. | Your attention shows up here after your first session. | |
| Not recorded for every session (Deep Focus) | Missing for some sessions | |

## Navigation and shell

| Now | Proposal | Note |
|---|---|---|
| AI COMPANION · SOON | *(remove from the main nav)* | Recommendation: a disabled tab for a feature that doesn't exist is a broken promise in the most visible spot. Decision for Clemens |
| Workspace Setup | Desk | Or "Workspace". Shorter tab label |
| 03 OCT 2026 \| 18:39:19 | Sat 3 Oct 18:39 | Applied in the draft (part of the window bar restyle): no ticking seconds, no uppercase |

## Analytics

| Now | Proposal | Note |
|---|---|---|
| 17 plotted · 0 excluded | 17 sessions shown | When something is excluded: "17 shown · 2 too short to score" |
| Qualified sessions | Sessions that count | |
| Time above threshold / At or above the focus threshold | Focused time / Score 40 or higher | Keeps the threshold visible without the word |
| Data coverage | Camera saw you | Value stays a percentage |
| Session time by measured attention state | Where your session time went | |
| Exact Flow time | Deep Focus | Same field the Lab calls Deep Focus; two names for one thing confuse |
| No qualified session in this selection has exact Flow time. | None of these sessions recorded Deep Focus. | |
| A comparison needs two time periods with at least 3 qualified sessions each. | Comparisons appear once each period has 3 sessions. | |
| Output evidence | What you produced | Metadata only; never implies content was read |
| UNRATED | No outcome set | |
| Recent work first · detailed evidence when you need it | *(remove)* | |

## Session and debrief

| Now | Proposal | Note |
|---|---|---|
| Drift risk active | Your focus is slipping | |
| This is now active drift | You've drifted off | |
| The session has left productive focus | You've been away from the work for a while | |
| Fade is turning into a detour | Attention is fading | |
| Lock-in is fading into fatigue | You look tired. A short break may help | "may": tiredness is inferred, not known |
| The ramp needs a clean minute | Give it one undistracted minute | |
| Close the detour before the ramp begins | Close the distraction to get started | |
| Preserve the lock-in block | You're in deep focus. Keep going | |
| Signal weak | Camera can barely see you | |
| Calibrating | Getting ready | |
| Attention phases | How your focus moved | |
| Activity alignment | Did the work match the plan? | |
| Digital environment | Apps and sites | |
| Session reference | *(remove, or "Session details")* | |

## Protection

| Now | Proposal | Note |
|---|---|---|
| Website helper required | Website blocking needs one more step | |
| Install helper / Remove helper | Turn on website blocking / Turn off website blocking | Admin password prompt still explained next to it |
| Native Companion unavailable | The app's background part isn't running | |
| Automation permission required | Allow Eudaimonai to see the active app | |
| Internal camera diagnostics | Camera test (internal) | Internal builds only |

## Known issues found while reviewing

- **"100/100 attention" in the Lab** was not a display bug in the app. It came
  from the sample data used for the website screenshots: that seed wrote
  `sessionEfficiency` as the share of time at score 40 or higher, which is
  almost always 100%. In the app, `sessionEfficiency` is computed in
  `deriveSessionFocusMetric` as `scoreSum / measuredSeconds`, the session's
  average attention, so the field and its label match. Today's app also
  rejects such a seed row (no phase totals), which is why the fixed seed
  carries them.
- **German weekdays ("MO., 28.")**: the Lab formatted dates with the system
  locale (`toLocaleDateString([])`) while every other screen uses `en-US`.
  Fixed in the Lab draft.
- **"Unset"** was rendered as a visible outcome. The Lab draft shows nothing
  when no outcome was set.
- **"AI COMPANION · SOON"**: unchanged. See the navigation proposal above.
