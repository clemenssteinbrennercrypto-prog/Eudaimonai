// Measures derived from a session's stored 5-second timeline (AGENTS.md §11).
//
// Nothing here runs live or feeds the score. Every value is recomputed from
// samples already saved, so a definition can be refined without a new ruler
// version and every stored session gets the same treatment. Each count needs
// at least two consecutive samples (10 s): one noisy 5 s sample never makes a
// lapse or a switch (invariant 2).
//
// Timeline samples exist only for measured time. Breaks and camera gaps leave
// holes, and nothing is ever counted across a hole: a lapse that "ended" on
// the far side of a break is not a recovery, it is missing data.
import { FOCUSED_SCORE } from './attention'
import { DEEP_FOCUS_TIME_VERSION, FLOW_ENTRY_MS } from './attentionSampling'
import { sessionFocusMeasurement } from './historyTrend'

export const SESSION_MEASURES_VERSION = 2
export const TIMELINE_INTERVAL_SECONDS = 5
/** Samples further apart than this belong to different stretches. */
const CONTIGUOUS_GAP_SECONDS = TIMELINE_INTERVAL_SECONDS * 1.5
/** A state must hold this many consecutive samples (10 s) to count. */
const HOLD_SAMPLES = 2
/** Per-hour rates from a few minutes extrapolate noise; the Focus Score
 *  requires the same minimum of measured time. */
const MIN_MEASURED_SECONDS_FOR_RATES = 5 * 60

function validSamples(timeline) {
  if (!Array.isArray(timeline)) return []
  return timeline
    .filter(sample => Number.isFinite(sample?.second) && Number.isFinite(sample?.score))
    .sort((a, b) => a.second - b.second)
}

/** Split into stretches of contiguous measurement. */
function contiguousStretches(samples) {
  const stretches = []
  let current = []
  for (const sample of samples) {
    const previous = current[current.length - 1]
    if (previous && sample.second - previous.second > CONTIGUOUS_GAP_SECONDS) {
      stretches.push(current)
      current = []
    }
    current.push(sample)
  }
  if (current.length) stretches.push(current)
  return stretches
}

/** Consecutive runs of samples sharing `keyOf`, as { key, start, end, length }
 *  with sample indices into the stretch. */
function runsOf(stretch, keyOf) {
  const runs = []
  stretch.forEach((sample, index) => {
    const key = keyOf(sample)
    const last = runs[runs.length - 1]
    if (last && last.key === key) {
      last.end = index
      last.length += 1
    } else {
      runs.push({ key, start: index, end: index, length: 1 })
    }
  })
  return runs
}

function isFocusedSample(sample) {
  return typeof sample.focused === 'boolean' ? sample.focused : sample.score >= FOCUSED_SCORE
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function perHour(count, measuredSeconds) {
  return Math.round((count / (measuredSeconds / 3600)) * 10) / 10
}

/**
 * Lapses: stretches of ≥ 10 s below the focused threshold.
 * Recovery: from a lapse's first sample until attention is back at or above
 * the threshold for ≥ 10 s. A lapse whose stretch ends before that is left
 * out of the median rather than guessed.
 */
function lapsesAndRecovery(stretches) {
  let count = 0
  const recoveries = []
  for (const stretch of stretches) {
    const runs = runsOf(stretch, sample => isFocusedSample(sample))
    runs.forEach((run, index) => {
      if (run.key !== false || run.length < HOLD_SAMPLES) return
      count += 1
      const back = runs.slice(index + 1).find(next => next.key === true && next.length >= HOLD_SAMPLES)
      if (back) recoveries.push(stretch[back.start].second - stretch[run.start].second)
    })
  }
  return { count, recoveries }
}

/** The work context a sample was in: app, plus the site inside a browser.
 *  null when the sample predates context recording or the Companion had no
 *  reading at that moment. */
function contextKey(sample) {
  const app = sample?.activity?.app
  if (typeof app !== 'string' || !app.trim()) return null
  const domain = typeof sample.activity.domain === 'string' ? sample.activity.domain.trim() : ''
  return `${app.trim().toLowerCase()}|${domain.toLowerCase()}`
}

/**
 * Context switches: changes between work contexts that each held ≥ 10 s.
 * A 5 s detour that returns to the same context is not a switch, and an
 * unknown reading breaks the sequence instead of bridging it.
 */
function contextSwitches(stretches) {
  let switches = 0
  for (const stretch of stretches) {
    let previousStable = null
    for (const run of runsOf(stretch, contextKey)) {
      if (run.key === null) {
        previousStable = null
        continue
      }
      if (run.length < HOLD_SAMPLES) continue
      if (previousStable !== null && previousStable !== run.key) switches += 1
      previousStable = run.key
    }
  }
  return switches
}

/** Context switching is only measurable on sessions recorded with the app on
 *  every sample (added 6 Oct 2026) and with at least one real reading. */
function recordsContext(samples) {
  return samples.length > 0 &&
    samples.every(sample => typeof sample?.activity?.app === 'string') &&
    samples.some(sample => contextKey(sample) !== null)
}

/**
 * Longest unbroken Deep Focus block, including the qualifying warm-up that the
 * exact Flow accumulator credits retroactively. `inFlow` proves whether a
 * stamped run opened a new Flow span. A brief unqualified sample can split the
 * displayed block while the gate remains active, but it never earns a second
 * warm-up. Missing gate state is refused by deriveSessionMeasures.
 */
function longestDeepFocusBlock(stretches, flowSeconds) {
  let longest = 0
  for (const stretch of stretches) {
    for (const run of runsOf(stretch, sample => sample.deepFocused === true)) {
      if (run.key !== true) continue
      const previous = stretch[run.start - 1]
      const openedFlow = previous == null || previous.inFlow === false
      const warmupSeconds = openedFlow ? FLOW_ENTRY_MS / 1000 : 0
      const seconds = warmupSeconds +
        stretch[run.end].second - stretch[run.start].second + TIMELINE_INTERVAL_SECONDS
      longest = Math.max(longest, seconds)
    }
  }
  return Math.min(longest, flowSeconds)
}

/**
 * Derived measures for one session. Every field is null when it cannot be
 * computed honestly: no measurement, too little measured time for a rate,
 * or a session recorded before the samples carried what the measure needs.
 */
export function deriveSessionMeasures(session) {
  const empty = {
    version: SESSION_MEASURES_VERSION,
    measuredSeconds: null,
    lapses: null,
    recovery: null,
    switches: null,
    longestDeepFocusSeconds: null,
  }
  const measurement = sessionFocusMeasurement(session)
  const samples = validSamples(session?.timeline)
  if (!measurement || samples.length === 0) return empty

  const measuredSeconds = measurement.measuredSeconds
  const stretches = contiguousStretches(samples)
  const ratesAllowed = Number.isFinite(measuredSeconds) && measuredSeconds >= MIN_MEASURED_SECONDS_FOR_RATES

  const { count: lapseCount, recoveries } = lapsesAndRecovery(stretches)
  const lapses = ratesAllowed ? { count: lapseCount, perHour: perHour(lapseCount, measuredSeconds) } : null
  const recovery = ratesAllowed && recoveries.length > 0
    ? { medianSeconds: median(recoveries), recovered: recoveries.length }
    : null

  const switchCount = recordsContext(samples) ? contextSwitches(stretches) : null
  const switches = ratesAllowed && switchCount != null
    ? { count: switchCount, perHour: perHour(switchCount, measuredSeconds) }
    : null

  const exactFlow = session?.deepFocusTimeVersion === DEEP_FOCUS_TIME_VERSION &&
    Number.isFinite(session.flowSeconds) && session.flowSeconds >= 0 &&
    samples.length > 0 &&
    samples.every(sample =>
      typeof sample.deepFocused === 'boolean' && typeof sample.inFlow === 'boolean')
  const longestDeepFocusSeconds = exactFlow ? longestDeepFocusBlock(stretches, session.flowSeconds) : null

  return {
    version: SESSION_MEASURES_VERSION,
    measuredSeconds,
    lapses,
    recovery,
    switches,
    longestDeepFocusSeconds,
  }
}
