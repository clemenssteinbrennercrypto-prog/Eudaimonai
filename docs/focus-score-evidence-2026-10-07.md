# Focus signal evidence and V4 decision — 7 October 2026

## Validity boundary

The Eudaimonai attention score is not a scientifically validated measure of
cognitive focus. No current study validates this exact MediaPipe signal,
scoring formula, population and real-world knowledge-work setting against a
ground truth such as sustained-attention task performance or post-session
self-report. V4 therefore removes rules the literature cannot justify instead
of replacing them with different precise-looking guesses.

## Decisions

| Previous rule | Evidence finding | V4 decision |
| --- | --- | --- |
| Absolute blink-rate bands earned up to 7 points or lost 15 | Blink rate decreases with task demand but increases with fatigue in the same session; absolute values also vary between people. One band cannot identify focus in uncontrolled work. | Blink rate does not change the score. |
| Mouth opening held for 1.5 s was treated as a yawn and cost 20 points | Yawning can accompany low vigilance, but a review found no evidence that yawning itself restores or reliably indexes arousal. Webcam mouth opening also confounds speech, eating and ordinary movement. | Mouth opening/yawning does not change the score. |
| “PERCLOS” was the share of frames below 55% of personal EAR over 30 s | Published PERCLOS is normally time with eyelids at least 80% closed; devices, definitions and windows vary. The implementation was not that construct, and no source validated its 8%/15% cutoffs or 30 s window. | Closure share does not change the score and is not called PERCLOS. |
| EAR below the absolute value 0.18 triggered closure penalties | Facial-landmark blink work shows that the useful EAR threshold varies substantially by dataset/person and recommends temporal or adaptive methods. | Sustained closure is relative to the user's robust calibration median. |
| A closure at 800 ms was labelled an early microsleep | Eyelid-closure duration has evidence as a drowsiness signal under dedicated measurement, but the 800 ms webcam cutoff and the word “microsleep” were unsupported. | The early penalty and microsleep label are removed. A single conservative 1.5 s hold remains for directly observed sustained closure. |
| The positive-focus ramp accrued at 40% for two minutes after distraction | The cited interruption and attention-restoration papers do not establish this recovery curve. | One measured ramp rate is used before and after distraction. |

The retained sustained-closure boundary is deliberately narrow. A personal EAR
ratio of 0.55 must hold for 1.5 seconds before it costs points. These values are
versioned product boundaries chosen to reject ordinary blinks; they are not a
medical fatigue detector and are not described as one. Post-session analysis
reports sustained closure as the observation it is and does not infer fatigue.

## Version boundary

V4 keeps the exact native V2 camera pipeline, MediaPipe package and model
hashes, plus V3's earned-top ceiling. It changes the remaining score
interpretation, so new sessions store `attentionScoringVersion: 4` and source
`native_mediapipe_v4_evidence_clean`. V1–V3 sessions remain readable but do
not enter V4 comparisons, baselines or mixed-generation days. The score trace
is version 4 as well.

## Primary evidence

- Soukupová, *Eye Blink Detection Using Facial Landmarks* (2016): fixed EAR
  thresholds vary across datasets; adaptive/temporal detection performs better.
  <https://dspace.cvut.cz/entities/publication/fbcbe690-daaf-4037-9edd-41a51703ecec/full>
- Maffei & Angrilli, *Spontaneous eye blink rate: An index of dopaminergic
  component of sustained attention and fatigue* (2018): task difficulty and
  time-on-task move blink rate in different directions.
  <https://pubmed.ncbi.nlm.nih.gov/29133149/>
- Dinges et al., NHTSA PERCLOS report (1998): PERCLOS is a drowsiness measure
  based on substantial eyelid closure, not the former EAR-share proxy.
  <https://rosap.ntl.bts.gov/view/dot/2518>
- Abe, *PERCLOS-based technologies for detecting drowsiness* (2023): methods,
  devices, definitions and time windows are heterogeneous and need
  standardisation. <https://pmc.ncbi.nlm.nih.gov/articles/PMC10108649/>
- Wilkinson et al., *The accuracy of eyelid movement parameters for drowsiness
  detection* (2013): average closure duration has promise under IR
  oculography; it does not validate Eudaimonai's former 800/1500 ms webcam
  thresholds. <https://pubmed.ncbi.nlm.nih.gov/24340294/>
- Guggisberg et al., *Why do we yawn?* (2010): review evidence does not support
  using yawning as a direct arousal mechanism or precise attention penalty.
  <https://pubmed.ncbi.nlm.nih.gov/20357462/>

## What would validate the score

The next scientific step is not another literature-derived weight. It is a
prospective within-person study comparing preregistered score features with an
independent ground truth collected after the session or in a short validation
task. Thresholds and weights should change only after enough paired data exists;
that change would require another stored scoring generation.
