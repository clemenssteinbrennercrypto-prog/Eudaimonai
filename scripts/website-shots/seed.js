// Runs inside the dev page (Vite serves /src). Builds demo history through the
// app's own accumulation, ceiling and save paths so every number on screen is
// computed by the real code. Only touches the isolated browser's localStorage.
export async function seed({ today }) {
  const S = await import('/src/lib/attentionSampling.js')
  const A = await import('/src/lib/attentionScore.js')
  const M = await import('/src/lib/cameraMeasurement.js')
  const F = await import('/src/lib/focusMetric.js')
  const R = await import('/src/lib/sessionRepository.local.js')
  const I = await import('/src/lib/sessionIntent.js')

  localStorage.clear()
  localStorage.setItem('eudaimonia_onboarded', 'true')

  let rngState = 20261011
  const rnd = () => ((rngState = (rngState * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const between = (a, b) => a + (b - a) * rnd()
  const pick = list => list[Math.floor(rnd() * list.length)]

  const TASKS = [
    ['Investor update draft', ['Writing']],
    ['Pricing model v2', ['Deep work']],
    ['Auth service refactor', ['Coding']],
    ['Onboarding flow review', ['Deep work']],
    ['Literature review, chapter 2', ['Reading', 'Study']],
    ['Landing page copy', ['Writing']],
    ['Data pipeline tests', ['Coding']],
    ['Quarterly plan', ['Deep work']],
    ['Paper notes: attention networks', ['Reading']],
    ['API migration', ['Coding']],
  ]

  // A day's rhythm: strong late morning, a post-lunch dip, a decent afternoon.
  const hourQuality = h => (h < 9 ? 0.92 : h < 12 ? 1.17 : h < 14 ? 0.76 : h < 17 ? 0.88 : 0.84)

  function simulate({ minutes, quality }) {
    const total = Math.round(minutes * 60)
    let state = {}
    let gate = {}
    let earned = { earnedMs: 0, belowFocusedMs: 0 }
    let level = between(66, 80) * quality
    let lapseLeft = 0
    let dipLeft = 0
    let sinceDistraction = 600_000
    let distractions = 0
    const timeline = []
    const transitions = []
    for (let second = 1; second <= total; second++) {
      // Slow drift of the underlying level, with occasional dips and lapses.
      level += (between(-1, 1) * 0.35) + ((77 * quality) - level) * 0.004
      if (lapseLeft <= 0 && dipLeft <= 0) {
        if (rnd() < 0.0007 / quality) { lapseLeft = Math.round(between(15, 70)); distractions++ }
        else if (rnd() < 0.0014) dipLeft = Math.round(between(40, 160))
      }
      let signal = level + between(-1.8, 1.8)
      if (second < 75) signal = Math.min(signal, 52 + second * 0.35)
      if (dipLeft > 0) { signal = Math.min(signal, between(52, 68)); dipLeft-- }
      if (lapseLeft > 0) { signal = between(18, 34); lapseLeft--; sinceDistraction = 0 }
      else sinceDistraction += 1000
      signal = Math.max(0, Math.min(100, signal))
      earned = A.stepEarnedAttention(earned, { signalScore: signal, deltaMs: 1000, hold: false })
      const score = Math.min(signal, A.earnedTopCeiling(earned.earnedMs))
      const qualified = Math.round(score) >= 72
      gate = S.advanceFlowGate(gate, { sampleMs: 1000, qualified })
      const result = S.accumulateMeasuredSpan(state, {
        sampleSeconds: 1,
        elapsedSecs: second,
        score,
        flowQualified: qualified,
        inFlow: gate.inFlow,
        flowWarmupRetained: !qualified && gate.qualifiedMs > 0,
        msSinceDistraction: sinceDistraction,
        preDriftActive: false,
        forceTimelineSample: second === total,
      })
      state = { ...state, ...result }
      if (result.phaseTransition) transitions.push(result.phaseTransition)
      if (result.timelineSample) timeline.push({ ...result.timelineSample, wallSecond: second, scoreTrace: null })
    }
    return { state, timeline, transitions, distractions, total }
  }

  const repo = R.createLocalSessionRepository()
  const end = new Date(today)
  const start = new Date(end); start.setDate(start.getDate() - 34)
  const saved = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay()
    const weekend = dow === 0 || dow === 6
    const isToday = d.toDateString() === end.toDateString()
    let slots = weekend ? (rnd() < 0.35 ? [10.5] : []) : pick([[9, 11, 15], [9.5, 14, 16.5], [8.5, 10.5, 14.5, 16.5], [10, 15]])
    if (isToday) slots = [9.25, 10.9, 14.5]
    // Later weeks are a little better: a visible, modest trend.
    const progress = (d - start) / (end - start)
    for (const slot of slots) {
      const startedAt = new Date(d); startedAt.setHours(Math.floor(slot), Math.round((slot % 1) * 60) + Math.floor(between(0, 9)), 0, 0)
      if (startedAt.getTime() > end.getTime()) continue
      const minutes = isToday ? [50, 75, 60][slots.indexOf(slot)] : pick([25, 45, 50, 50, 60, 75, 90])
      const quality = Math.min(1.16, (isToday ? 1.04 : 1) * hourQuality(startedAt.getHours()) * (0.9 + progress * 0.14) * between(0.93, 1.06))
      const sim = simulate({ minutes: minutes - F.FOCUS_METRIC_V1.calibrationSeconds / 60, quality })
      const s = sim.state
      const [task, tags] = isToday ? [TASKS[0], TASKS[2], TASKS[1]][slots.indexOf(slot)] : pick(TASKS)
      // The first calibrationSeconds of a real session are not measured.
      const actualSeconds = sim.total + F.FOCUS_METRIC_V1.calibrationSeconds + Math.round(between(3, 20))
      const record = F.withSessionFocusMetric({
        startedAt: startedAt.getTime(),
        endedAt: startedAt.getTime() + actualSeconds * 1000,
        timestamp: startedAt.getTime() + actualSeconds * 1000,
        wallSeconds: actualSeconds,
        pausedSeconds: 0,
        pauseIntervals: [],
        attentionScoringVersion: M.NATIVE_CAMERA_MEASUREMENT_V5.attentionScoringVersion,
        attentionMeasurementSource: M.NATIVE_CAMERA_MEASUREMENT_V5.id,
        attentionAccumulationVersion: S.ATTENTION_ACCUMULATION_VERSION,
        deepFocusTimeVersion: S.DEEP_FOCUS_TIME_VERSION,
        plannedDuration: minutes,
        actualSeconds,
        completed: true,
        focusLostCount: sim.distractions,
        distractionEvents: sim.distractions,
        preDriftEvents: 0,
        preDriftSeconds: 0,
        measuredSeconds: s.measuredSeconds,
        scoreSum: s.scoreSum,
        focusedSeconds: s.focusedSeconds,
        flowSeconds: s.flowSeconds,
        longestFocusedStreak: s.longestStreak,
        peakFocusStreak: s.longestStreak,
        avgFocusScore: Math.round(s.scoreSum / s.measuredSeconds),
        finalScore: s.score,
        trackingFaulted: false,
        scoreMeasured: true,
        // Browser storage holds ~5 MB; only the last week keeps its per-5 s trace.
        timeline: (end - startedAt) < 8 * 86400000 ? sim.timeline : [],
        distractionLog: [],
        protectionEvents: [],
        focusPhases: {
          seconds: s.phaseSeconds,
          dominant: Object.entries(s.phaseSeconds).sort((a, b) => b[1] - a[1])[0][0],
          final: s.currentPhase,
          transitions: sim.transitions,
        },
        task,
        goal: '',
        tags,
        energyLevel: rnd() < 0.6 ? pick(['high', 'medium', 'medium', 'low']) : null,
        energyLevelVersion: I.ENERGY_LEVEL_VERSION,
        goalOutcome: isToday ? 'yes' : pick(['yes', 'yes', 'yes', 'partly', 'yes', 'no']),
      })
      saved.push(await repo.saveSession(record))
    }
  }
  return { today: saved.filter(x => new Date(x.startedAt).toDateString() === end.toDateString()).map(x => x.task), saved: saved.length, stored: JSON.parse(localStorage.getItem('eudaimonia_sessions') || '[]').length, bytes: (localStorage.getItem('eudaimonia_sessions') || '').length }
}
