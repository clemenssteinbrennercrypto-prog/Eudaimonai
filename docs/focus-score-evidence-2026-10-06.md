# Focus Score evidence review — 6 October 2026

Scope: the research the camera scorer cites in code (`SessionScreen.jsx`,
`attention.js`, `cameraScoringConstants.js`, commit messages `d42a9ee`,
`5ed9755`, `2246d6b`), plus the core literature on each signal the scorer
uses. Each paper is run through the same extraction rubric, then translated
into Eudaimonai features and graded.

**Validity statement.** The Eudaimonai Focus Score has not been validated
against any established attention ground truth (thought probes, SART/gradCPT
performance, PVT lapses, EEG or observer coding). It is a product composite.
Individual inputs borrow from validated measures, but this document does not
support calling the score itself "scientifically validated", "science-backed"
or "research-proven". §5 sketches the study that would earn that claim.

Grades used throughout:

| Grade | Meaning |
| --- | --- |
| **A** | Strong direct support: the construct–signal link is replicated against an established ground truth, and the signal can be measured the way we measure it. |
| **B** | Indirect support: the link exists, but under a different sensor (EOG, IR eye tracker, balance board), task, population or definition than ours, or rests on one small study. |
| **C** | Product heuristic: no located evidence for the specific rule, or the cited source does not say what the code claims. |

How sources were checked: abstracts from Europe PMC/PubMed, full text where
openly available (Soukupová 2016, Hutt et al., Mark et al. 2008). Where only an
abstract or a secondary summary was reachable, the entry says so. No number
below is from memory.

---

## 1. Findings that change what the code may claim

| Code claim | What the source actually says | Consequence |
| --- | --- | --- |
| `PERCLOS_WIN_MS = 30 s` — "30s validated in PMC10108649" | PMC10108649 is Abe (2023), a **narrative review**. It reports that PERCLOS windows, closure definitions (<20/25/30 % open) and devices vary across studies, and calls for standardisation. It validates no 30 s window. | 30 s is a product choice (C). Remove the "validated" wording. |
| `EAR_BLINK = 0.20` — Soukupová & Čech (2016) | The thesis shows the best fixed EAR threshold **differs by dataset: 0.27 (ZJU), 0.08 (Eyeblink8), 0.15 (Silesian)**. Its own Fig. 5.8 shows 0.20 missing a blink. It recommends a trained SVM over a 13-frame EAR window, or a person-adaptive HMM. The landmarks are dlib/Chehra/Intraface, not MediaPipe. | `EAR_BLINK` and `EAR_HEAVY` are defined but unused: live detection already uses `0.72 ×` and `0.55 × personal baseline`, which matches the paper. The dead constants carry a misleading citation. `EAR_PROLONGED_CLOSE = 0.18` is still absolute. |
| PERCLOS = share of frames "heavy" (`EAR < 0.55 × baseline`) | Standard PERCLOS (Wierwille 1994; Dinges 1998) is the share of time the lids are **≥80 % closed**. 0.55 × open-eye EAR is roughly half-closed, not 80 %. | Our "PERCLOS" is a different, more sensitive measure. The published 15 % drowsiness cut-offs do not carry over to it, so `perclos > 8 / > 15` are C. |
| `EARLY_MICROSLEEP_MS = 800`, `PROLONGED_CLOSE_MS = 1500` — PMC3836343 (">500 ms slow closure…") | PMC3836343 is Wilkinson et al. (2013, *J Clin Sleep Med*). The abstract supports **average eye-closure duration** as a drowsiness indicator (71 % sensitivity, 88 % specificity for 3 lapses/min on the OSLER test). The 500 ms / 1000 ms figures could not be confirmed: the full text was behind a captcha. | Duration-of-closure → drowsiness is B (IR oculography, not webcam). The 800 / 1500 ms cut-offs are C until the figures are confirmed. |
| `MAR_YAWN = 0.50` — "Weng et al. (MDPI 2022)" | No such paper was found. The rule "mouth height/width > 0.5 for > 20 frames at 30 fps" appears in the literature attributed to Wang et al., found only through secondary sources. Separately, Guggisberg et al. (2010) review finds **no evidence that yawning tracks arousal**; its supported function is communicative. | Yawn penalty is C. Replace the citation with "unverified". |
| Circadian factor — "night fatigue 23:00–06:00 (Czeisler 1999)" | Czeisler et al. (1999) measures the **intrinsic period** of the circadian pacemaker (24.18 h). It says nothing about a 23:00–06:00 performance window. | Night window is C. The post-lunch dip (Monk 2005) is B, and Monk says it occurs "for some performance variables, and some individuals". |
| `getCircadianFactor` inline comments: "night owl — more lenient", "mildly lenient" | Multiplying the alert delay by 0.75 makes the alert fire **sooner**, which is stricter. Invariant 1 in CLAUDE.md is right and the code follows it. The inline comment says the opposite. | Comment fix only; the behaviour is correct. Not changed in this PR. |
| Recovery ramp at 40 % speed for 2 min after a distraction — "Kaplan 1995; Mark et al. (2008) showing ~2 min re-engagement time" | Kaplan (1995) is a theory paper on nature restoring directed-attention fatigue; it has no re-engagement timing. Mark et al. (2008) measured no re-engagement time. "Two minutes" in that paper is the **interval between experimental interruptions**. Its finding: interrupted people finished faster, with more stress, frustration, time pressure and effort. | The ramp is C. Keep it if wanted, but drop the citation. |
| Blink-rate bonuses: 12–20/min = "optimal" (+7), 5–12/min = "focus suppression" (+4) | Within-person evidence runs the other way: blink rate **falls** as attentional load rises and **rises** with fatigue (Maffei & Angrilli 2018) and with mind wandering (Smilek et al. 2010). Absolute bands ignore large between-person differences. | Direction-of-change is B. Absolute bands, and rewarding 12–20 more than 5–12, are C. See F4. |

---

## 2. Per-paper extraction

Rubric fields (abbreviated): **Construct** · **Ground truth** · **Signals** ·
**Window** · **Significant** · **Webcam-translatable?** · **Confounders** ·
**Supports** (absolute / relative / variability / multimodal) · **Feature**.

### 2.1 Drowsiness and fatigue (eye closure)

**P1. Soukupová (& Čech) 2016 — Eye blink detection using facial landmarks** (CTU diploma thesis CTU–CMP–2016–05; CVWW 2016 paper). Full text read.
- Construct: blink events only; not attention or fatigue.
- Ground truth: manually annotated blinks in ZJU, Eyeblink8 and Silesian video datasets.
- Signals: per-frame EAR from 6 eye landmarks.
- Window: per frame. SVM over a 13-frame (±6 frames ≈ ±200 ms at 30 fps) EAR vector.
- Significant (best-F1 operating points): thresholding P/R 89.2/98.5 (ZJU), 77.9/77.9 (Eyeblink8), 74.2/94.0 (Silesian). EAR-SVM 97.7/92.9, 94.3/96.2, 93.0/98.6. The best threshold varied 0.08–0.27.
- Webcam: yes; 320×240 and 640×480 video. Accuracy holds down to about 20 px inter-ocular distance; below that, open and closed eyes get confused.
- Confounders: person-specific eye shape, squinting or smiling, head pose, resolution, landmark model.
- Supports: **relative**, plus a short temporal pattern. Explicitly not a single absolute threshold.
- Feature: blink detection from a per-person baseline (exists) → **A** for blink detection as such. It gives no evidence about attention.

**P2. Wierwille et al. 1994; Dinges, Mallis, Maislin & Powell 1998 — PERCLOS** (NHTSA DOT-HS-808-762). Report summary only.
- Construct: drowsiness / lapses of vigilance.
- Ground truth: PVT lapses under controlled sleep deprivation.
- Signals: PERCLOS = proportion of time per minute that the lids are ≥80 % closed. Compared against other ocular and EEG candidates.
- Window: 1 min, as defined in the 1994 simulator study.
- Significant: of the candidate measures, only PERCLOS tracked every subject's PVT-lapse profile reliably.
- Webcam: partly. The originals used dedicated cameras/IR; P80 needs reliable lid-aperture estimates.
- Confounders: closure definition, lighting, glasses, downward gaze (lids lower when looking down).
- Supports: an absolute threshold for **within-person sleep-deprivation** contrasts. Weaker across people (see P5).
- Feature: drowsiness index → **A** for the construct at P80; our P≈45 variant is **B**.

**P3. Abe 2023 — PERCLOS-based technologies for detecting drowsiness** (*Sleep Advances* 4(1), PMC10108649). Narrative review.
- Construct: drowsiness.
- Ground truth across the cited studies: PVT, OSLER, KSS, PSG, lane deviation.
- Signals: PERCLOS, compared with blink duration, the Johns Drowsiness Scale, HRV and EEG.
- Window: heterogeneous; sampling 2–120 Hz. No standard window.
- Significant: PERCLOS rises with sleep deprivation and circadian misalignment and tracks PVT lapses across 42 h awake. It was insensitive under moderate drowsiness, in older adults and in some aviation tasks.
- Webcam: some cited studies used laptop cameras. Different devices give different PERCLOS values.
- Confounders: closure definition (<20/25/30 % open), device, population.
- Supports: within-person change; calls for standardisation, not a universal cut-off.
- Feature: none new; corrects the 30 s citation (§1).

**P4. Wilkinson et al. 2013 — Accuracy of eyelid movement parameters for drowsiness detection** (*J Clin Sleep Med*, PMC3836343). Abstract only.
- Construct: drowsiness (lapses).
- Ground truth: OSLER lapses; 33 participants, 71 data points.
- Signals: IR-oculography eyelid parameters. Average closure duration (IED), amplitude/velocity ratio, Johns Drowsiness Scale (JDS) composite.
- Window: lapses per minute.
- Significant: IED 71 % sensitivity / 88 % specificity for 3 lapses/min. JDS 77 % / 100 % sensitivity for 3 / 5 lapses.
- Webcam: closure duration yes, roughly. Lid velocity needs high frame rates.
- Confounders: sensor, lighting.
- Supports: **multimodal composite beats single** (JDS > IED).
- Feature: long-closure detection → **B**; specific ms cut-offs → **C** (see §1).

**P5. Ingre, Åkerstedt et al. 2006 — Subjective sleepiness, simulated driving and blink duration** (*J Sleep Res*). Abstract.
- Construct: sleepiness.
- Ground truth: KSS every 5 min; lane drift (SDLAT).
- Signals: EOG blink duration.
- Window: 5-min intervals over a 2-h drive; 10 shift workers, after normal sleep vs after a night shift.
- Significant: KSS predicted blink duration (p = .003 quadratic, steeper at high KSS) and SDLAT (p < .001). **Large individual differences in intercept (p < .001).**
- Webcam: blink duration yes, roughly. Our 30 fps frame cadence limits resolution to about 33 ms.
- Confounders: individual baseline differences dominate.
- Supports: **relative/personal baselines** strongly; non-linear (steeper at high sleepiness).
- Feature: F2 (personal closure baseline) → **B**.

**P6. Hertig-Godeschalk et al. 2020 — Microsleep episodes in the borderland** (*Sleep*). Abstract.
- Construct: microsleep episodes, defined in EEG.
- Ground truth: visual EEG scoring (BERN criteria) during Maintenance of Wakefulness Tests; 76 patients.
- Signals: EEG.
- Window: episode-level.
- Significant: first-microsleep latency is significantly shorter than AASM sleep latency.
- Webcam: no. The paper separates EEG microsleep from behaviour-defined microsleep.
- Confounders: none relevant to us.
- Supports: none for a camera threshold.
- Feature: a long closure seen on camera should not be labelled "microsleep" in user copy → **C** for the term.

**P7. "Weng et al. (MDPI 2022)" — not found.** The MAR > 0.5 for > 20 frames rule traces, in secondary sources, to Wang et al. Treat it as unverified (C).

**P8. Guggisberg et al. 2010 — Why do we yawn?** (*Neurosci Biobehav Rev*). Abstract.
- Construct: function of yawning.
- Ground truth: review of experimental evidence.
- Significant: the arousal, respiratory and thermoregulation hypotheses lack evidence. The communicative/empathic function has growing support.
- Webcam: detecting a yawn is easy; interpreting it is not.
- Confounders: contagion, boredom, stress, talking or eating.
- Supports: nothing for a fatigue penalty.
- Feature: yawn penalty → **C**. At most a soft "maybe take a break" hint, never a large deduction.

### 2.2 Time of day

**P9. Monk 2005 — The post-lunch dip in performance** (*Clin Sports Med*). Abstract.
- Construct: performance dip / sleep propensity.
- Ground truth: performance tasks across the day.
- Window: hours of the day.
- Significant: the dip is real for some variables and some individuals, occurs without lunch, is worsened by high-carbohydrate meals and is more likely in extreme morning types.
- Webcam: n/a (clock only).
- Confounders: chronotype, meal, sleep debt.
- Supports: **relative/personal**. Not a universal 13:00–15:00 window.
- Feature: post-lunch adjustment → **B**. A personal profile learned from the user's own history is better (F9).

**P10. Czeisler et al. 1999 — Intrinsic circadian period** (*Science*). Abstract.
- Construct: circadian period (melatonin, temperature, cortisol).
- Significant: mean period 24.18 h, tight distribution, the same in young and older adults.
- Feature: none. Does not support a 23:00–06:00 window → **C** for that citation.

**P11. Mark, Iqbal, Czerwinski & Johns 2014 — Bored Mondays and focused afternoons** (CHI). Search summary.
- Construct: in-situ attentional state (focus, boredom, engagement).
- Ground truth: experience-sampling probes; 32 information workers over 5 days, with computer logging.
- Window: day and week rhythms.
- Significant: focus peaks mid-afternoon and boredom peaks early afternoon. Mondays bring the most boredom and the most focus. Focused work is the most stressful.
- Webcam: no; logs plus self-report.
- Supports: **temporal variability**, personal and contextual. Note it partly contradicts a blanket "afternoon dip".
- Feature: F9 (personal rhythm from history) → **B**.

### 2.3 Sustained attention and mind wandering (behavioural ground truths)

**P12. Robertson et al. 1997 — "Oops!" (SART)** (*Neuropsychologia*). Abstract.
- Construct: sustained attention / action slips.
- Ground truth: self- and informant-reported everyday attention failures; TBI severity.
- Signals: no-go errors; RT speeding before errors.
- Window: trial level (the trials immediately before an error).
- Significant: SART correlates with everyday attentional failures in 75 controls and with Glasgow Coma Scale (r = −.58) in 34 TBI patients. Errors are predicted by RT shortening just before them.
- Webcam: no; this is a task.
- Supports: **temporal variability** (pre-error speeding).
- Feature: ground-truth instrument for validation (§5) → **A** as an instrument.

**P13. Esterman, Noonan, Rosenberg & DeGutis 2013 — In the zone or zoning out?** (*Cereb Cortex*). Abstract.
- Construct: moment-to-moment sustained-attention state.
- Ground truth: gradCPT errors; fMRI.
- Signals: reaction-time variability (variance time course).
- Window: trial-wise and moving windows over a session.
- Significant: two states. "In the zone" is stable, less error-prone, with higher default-mode activity. "Out of the zone" is effortful, relies on the dorsal attention network and is more error-prone.
- Webcam: no direct signal. The principle that variability is the marker, not the mean, transfers.
- Supports: **temporal variability** strongly.
- Feature: F6 (stability-of-signal metric) → **B**.

**P14. Rosenberg, Noonan, DeGutis & Esterman 2013 — gradCPT** (*Atten Percept Psychophys*). Abstract.
- Construct: sustained visual attention.
- Ground truth: gradCPT commission errors; self-reported mindfulness and everyday lapses.
- Signals: RT variability; errors.
- Window: 1.2 s trials; 12-min task.
- Significant: vigilance decrement within 12 min (more errors, more RT variability). Periods of higher RT variability carry more errors.
- Webcam: no.
- Supports: **temporal variability**, **time-on-task decline**.
- Feature: gradCPT as an optional 3–5 min calibration or validation probe → **A** as an instrument.

**P15. Smilek, Carriere & Cheyne 2010 — Out of mind, out of sight** (*Psychol Sci*). Press summaries only; the paper is paywalled.
- Construct: mind wandering.
- Ground truth: random thought probes during reading; N = 15.
- Signals: blink rate from an eye tracker.
- Window: the interval before each probe.
- Significant: blink rate was higher before mind-wandering reports than before on-task reports. Effect size not extracted.
- Webcam: blink counting yes.
- Confounders: small N; reading only; dry eye; screen brightness.
- Supports: within-person relative change.
- Feature: F4 → **B**.

**P16. Maffei & Angrilli 2018 — Spontaneous blink rate as an index of attention and fatigue** (*Int J Psychophysiol*). Abstract.
- Construct: attentional load and fatigue.
- Ground truth: Mackworth Clock at three difficulty levels; misses and RT. N = 33, all female.
- Signals: EOG blink rate.
- Window: 7-min tasks analysed minute by minute.
- Significant: the hard task gave lower blink rates (and more misses). Blink rate rose from about minute 4 regardless of difficulty, indexing fatigue.
- Webcam: yes, counting.
- Confounders: task difficulty and fatigue push blink rate in opposite directions, so a single absolute rate is ambiguous.
- Supports: **relative change within session**; absolute bands are uninterpretable.
- Feature: F4 → **B**. Also argues against the "12–20 optimal" bonus.

**P17. Seli et al. 2014 — Restless mind, restless body** (*J Exp Psychol LMC*). Abstract.
- Construct: mind wandering (and its depth).
- Ground truth: thought probes during the metronome response task.
- Signals: fidgeting from a Wii Balance Board; response variability.
- Window: the interval before each probe.
- Significant: mind wandering was accompanied by more fidgeting (Study 1); only **deep** mind wandering raised fidgeting, while response variability rose even with mild mind wandering (Study 2).
- Webcam: head-motion variance is a proxy, not the measured body sway.
- Confounders: posture shifts, typing movements.
- Supports: **temporal variability**.
- Feature: head-stability bonus (exists) → **B**.

### 2.4 Camera-based detection of attention states (closest to our setup)

**P18. Hutt, Wong, Papoutsaki, Baker, Gold & Mills — Webcam-based eye tracking to detect mind wandering and comprehension errors** (*Behavior Research Methods*, 2024). Full text read.
- Construct: task-unrelated thought (TUT); comprehension.
- Ground truth: probe-caught TUT during online reading.
- Signals: WebGazer gaze. Global features (gaze-point count, dispersion) and local features (time in areas of interest).
- Window: the screen before the probe, roughly tens of seconds.
- Significant: TUT detection was above chance but weak: κ = 0.15, F1(TUT) 0.25 vs a chance F1 of 0.18. Participant-level predicted vs actual TUT ρ = 0.27. Comprehension prediction was strong (κ = 0.57, ρ = 0.77). WebGazer accuracy is about 4.17° (research trackers < 1°).
- Webcam: **yes, a consumer webcam**, N = 105 + 173.
- Confounders: robust to glasses and lighting. TUT detection fell to near chance for Black participants (κ = 0.04 vs 0.17 for White participants). The authors say more work is needed before deploying TUT prediction.
- Supports: **multimodal** (global + local features best); a session-level aggregate beats a per-moment call.
- Feature: F7 → **B**. Strongest evidence that per-moment "your mind wandered" calls from a webcam are not yet defensible.

**P19. Bosch & D'Mello 2021 — Automatic detection of mind wandering from video in the lab and in the classroom** (*IEEE Trans Affect Comput* 12(4)). Search summary.
- Construct: mind wandering.
- Ground truth: thought probes; reading in the lab (N = 135) and lectures in the wild (N = 15).
- Signals: face video; deep and LSTM features.
- Window: pre-probe windows.
- Significant: F1 0.44 (AUC-PR 0.40) and 0.459 (AUC-PR 0.39), above chance.
- Webcam: yes.
- Confounders: setting shift (lab to classroom).
- Supports: modest detection; transfer learning helps.
- Feature: F7 → **B**.

**P20. Whitehill, Serpell, Lin, Foster & Movellan 2014 — The faces of engagement** (*IEEE Trans Affect Comput*). Search summary.
- Construct: observer-rated engagement. This is appearance, not inner attention.
- Ground truth: human labels of video clips.
- Signals: facial expression features.
- Significant: inter-rater κ = 0.96 for binary high/low engagement and 0.56 for 4 levels. Machine accuracy is comparable to humans. Engagement predicted post-test better than pre-test scores did.
- Webcam: yes.
- Confounders: labels measure *looking* engaged.
- Supports: coarse binary states, not fine grading.
- Feature: F8 → **B**. Supports a coarse "engaged / not" signal; argues against the false precision of a 0–100 score.

### 2.5 Interruptions, breaks, devices

**P21. Mark, Gudith & Klocke 2008 — The cost of interrupted work** (CHI). Full text read.
- Construct: performance and stress under interruption.
- Ground truth: task time, email quality, NASA-TLX plus a stress item. N = 48.
- Window: interruptions every 2 min during an email task.
- Significant: interrupted people finished faster with no quality loss. Stress rose (F(2,92) = 12.15, p < .001), along with frustration, time pressure and effort. Interruption context (same vs different) made no difference.
- Webcam: n/a.
- Supports: nothing about recovery timing.
- Feature: F10 (count interruptions, frame them as a stress cost) → **B**. Not a source for the 2-min ramp (§1).

**P22. Kaplan 1995 — The restorative benefits of nature** (*J Environ Psychol* 15). Abstract.
- Construct: directed-attention fatigue and restoration (theory).
- Ground truth: none; theoretical framework.
- Feature: break content (nature views) → **B** via P23. Not a ramp source.

**P23. Lee, Williams, Sargent, Williams & Johnson 2015 — 40-second green roof views sustain attention** (*J Environ Psychol*). Search summary.
- Construct: sustained attention.
- Ground truth: SART; N = 150, randomised.
- Window: a 40-s micro-break between SART blocks.
- Significant: performance after a green-roof view held steady and became more consistent. After a concrete-roof view it declined (reported as about +6 % vs −8 %).
- Webcam: n/a.
- Feature: F5 (break content) → **B**.

**P24. Ariga & Lleras 2011 — Brief and rare mental breaks keep you focused** (*Cognition*). Abstract.
- Construct: vigilance decrement.
- Ground truth: vigilance-task accuracy over time.
- Significant: briefly switching task goals during a long vigilance task averted the decrement.
- Feature: F5 (brief planned goal switches) → **B**; one lab paradigm.

**P25. Parry 2022 — Does the mere presence of a smartphone impact cognitive performance? (meta-analysis)** (PsyArXiv preprint).
- Construct: cognitive performance with a phone present.
- Ground truth: 56 effects, n = 7093.
- Significant: only working memory showed a significant (small) pooled effect. Sustained attention and other functions were null. Low power, high heterogeneity.
- Feature: penalising the phone's mere *presence* → **C**. Picking it up or looking at it is directly observed off-task behaviour (a face-validity rule, still **C** as attention science).

---

## 3. Cross-paper answers to rubric item 8

| Question | Answer | Evidence |
| --- | --- | --- |
| Absolute thresholds? | **Weakly.** Only within tightly defined protocols (P80 PERCLOS under sleep deprivation). Even EAR blink thresholds do not transfer across datasets. | P1, P2, P3, P5 |
| Relative / personal baselines? | **Yes, consistently.** Individual intercepts dominate blink duration; adaptive per-person blink models beat fixed thresholds; the post-lunch dip is individual. | P1, P5, P9, P16 |
| Temporal variability? | **Yes, for behaviour.** RT variability is the best-validated moment-to-moment attention index. Head-motion variability is only a proxy. | P12, P13, P14, P17 |
| Multimodal combinations? | **Yes, modestly.** Composites beat single features (JDS > IED; global + local gaze best), but gains are small and webcam-only mind-wandering detection stays weak. | P4, P18, P19 |

Temporal scale by construct: blink detection takes milliseconds (13-frame
window); drowsiness takes 1-min PERCLOS to 5-min KSS epochs; mind-wandering
detection uses the seconds-to-tens-of-seconds before a probe; vigilance
decrement shows up over 4–12 minutes; circadian and weekly rhythm shows up
over hours to days.

---

## 4. Feature translation and classification

Status: **exists** = already in the scorer, **adjust** = exists but should
change, **new** = proposal.

| # | Feature | Grounding | Grade | Status |
| --- | --- | --- | --- | --- |
| F1 | Per-person blink detection (EAR × baseline, recalibrated) | P1 | **A** for blink detection | exists |
| F1a | Delete the unused `EAR_BLINK = 0.20` / `EAR_HEAVY = 0.15` and their citation | P1 | — | adjust |
| F2 | Drowsiness from eye-closure share and long closures, **against the user's own baseline**, not fixed 8 % / 15 % / 800 ms / 1500 ms | P2–P5 | **B** (construct A, our webcam variant unvalidated); fixed cut-offs **C** | adjust |
| F3 | Rename "PERCLOS" in code and UI to "eye-closure share" unless P80 is implemented | P2, P3 | — | adjust |
| F4 | Blink rate as a **within-session relative change** (rising from the user's early-session level = fatigue or drift), replacing the absolute 12–20 / 5–12 bonuses | P15, P16 | **B** | adjust |
| F5 | Break nudges after sustained time-on-task, with short goal-switch or nature-view micro-breaks | P14, P16, P23, P24 | **B** | new |
| F6 | Attention-stability metric: variability of the per-second score/pose over a moving window, reported next to the mean | P13, P14, P17 | **B** | new |
| F7 | Mind-wandering estimates only as **session-level aggregates**, never per-moment alerts | P18, P19 | **B** | new / guardrail |
| F8 | Coarse state display (focused / drifting / away) instead of implying 1-point precision | P20, P18 | **B** | adjust (presentation) |
| F9 | Personal time-of-day profile learned from the user's history, replacing fixed 13–15 h and 23–06 h windows | P9, P11 | **B** | adjust |
| F10 | Count interruptions and self-interruptions (app switches); frame them as a stress and effort cost, not an attention score | P21 | **B** | new |
| F11 | Off-target distance pricing (30° = clearly away) | eye-in-head rotation range; no attention study located | **C** (physiological rationale only) | exists |
| F12 | Head-stability bonus | P17 | **B** | exists |
| F13 | Head pitch / yaw work-zone thresholds (25° / 30° / 55°) | ergonomics sources, not attention studies | **C** | exists |
| F14 | Yawn penalty | P7, P8 | **C** | adjust (soften or drop) |
| F15 | Phone-in-hand / looking-at-phone penalty | face validity; P25 null for mere presence | **C** | exists |
| F16 | 2-min post-distraction slow ramp | citations do not support it | **C** | exists; fix citation |
| F17 | Focus Score composite (68 base + bonuses − penalties, 0–100) | no validation | **C** | exists |

---

## 5. What would make the Focus Score defensible

The standard ground truth in this literature is the probe-caught method (P15,
P17, P18, P19). A minimal validation study:

1. Opt-in sessions show 4–6 random thought probes per hour: "Just before this,
   were you on task?" (on task / mind wandering / distracted by something
   external).
2. Log the Focus Score and its components for the 30 s before each probe.
3. Report participant-level correlation and pre-registered AUC/κ against chance,
   as Hutt et al. did, including subgroup slices (glasses, lighting,
   skin tone) because webcam detectors have shown disparities.
4. Optionally add a 3–5 min gradCPT (P14) at session start as a second,
   performance-based anchor.

Until such a study exists, product copy should describe the score as *"an
estimate from camera signals linked in research to attention and fatigue"* and
avoid "validated", "scientifically proven" and "measures your focus".

## Sources

- Soukupová T. (2016). *Eye Blink Detection Using Facial Landmarks.* CTU–CMP–2016–05. <https://cmp.felk.cvut.cz/ftp/articles/cech/Soukupova-TR-2016-05.pdf>
- Dinges D.F., Mallis M.M., Maislin G., Powell J.W. (1998). *Evaluation of techniques for ocular measurement as an index of fatigue and the basis for alertness management.* DOT-HS-808-762. <https://rosap.ntl.bts.gov/view/dot/2518>
- Abe T. (2023). PERCLOS-based technologies for detecting drowsiness. *Sleep Advances* 4(1). <https://pmc.ncbi.nlm.nih.gov/articles/PMC10108649/>
- Wilkinson V.E. et al. (2013). The accuracy of eyelid movement parameters for drowsiness detection. *J Clin Sleep Med.* PMC3836343.
- Ingre M. et al. (2006). *J Sleep Res.* doi:10.1111/j.1365-2869.2006.00504.x
- Hertig-Godeschalk A. et al. (2020). *Sleep.* doi:10.1093/sleep/zsz163
- Guggisberg A.G. et al. (2010). *Neurosci Biobehav Rev.* doi:10.1016/j.neubiorev.2010.03.008
- Monk T.H. (2005). *Clin Sports Med.* doi:10.1016/j.csm.2004.12.002
- Czeisler C.A. et al. (1999). *Science.* doi:10.1126/science.284.5423.2177
- Mark G., Iqbal S.T., Czerwinski M., Johns P. (2014). Bored Mondays and focused afternoons. CHI. <https://isr.uci.edu/node/2035.html>
- Robertson I.H. et al. (1997). *Neuropsychologia.* doi:10.1016/s0028-3932(97)00015-8
- Esterman M. et al. (2013). *Cereb Cortex.* doi:10.1093/cercor/bhs261
- Rosenberg M. et al. (2013). *Atten Percept Psychophys.* doi:10.3758/s13414-012-0413-x
- Smilek D., Carriere J.S.A., Cheyne J.A. (2010). *Psychol Sci.* doi:10.1177/0956797610368063
- Maffei A., Angrilli A. (2018). *Int J Psychophysiol.* doi:10.1016/j.ijpsycho.2017.11.009
- Seli P. et al. (2014). *J Exp Psychol LMC.* doi:10.1037/a0035260
- Hutt S. et al. (2024). Webcam-based eye tracking to detect mind wandering and comprehension errors. *Behavior Research Methods.* doi:10.3758/s13428-022-02040-x
- Bosch N., D'Mello S.K. (2021). *IEEE Trans Affect Comput* 12(4):974–988. <https://experts.colorado.edu/display/pubid_275909>
- Whitehill J. et al. (2014). The faces of engagement. *IEEE Trans Affect Comput.* <https://diego.ucsd.edu/node/43>
- Mark G., Gudith D., Klocke U. (2008). The cost of interrupted work. CHI. doi:10.1145/1357054.1357072
- Kaplan S. (1995). *J Environ Psychol* 15(3):169–182.
- Lee K.E. et al. (2015). 40-second green roof views sustain attention. *J Environ Psychol.* <https://www.ltl.org.uk/wp-content/uploads/2019/02/40-second-green-roof-views-sustain-attention.pdf>
- Ariga A., Lleras A. (2011). *Cognition.* doi:10.1016/j.cognition.2010.12.007
- Parry D.A. (2022). Brain drain meta-analysis. PsyArXiv. doi:10.31234/osf.io/tnyda
