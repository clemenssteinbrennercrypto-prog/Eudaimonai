// Personal baseline — a day read against the user's own usual (AGENTS.md §11).
//
// "Usual" is the median of the previous 28 days that have a current Focus
// Score on the camera generation in use now. Scored days keep the comparison
// on one ruler (the score refuses days without exact Deep Focus); the
// generation check is separate because a single day picks its own generation,
// so an older camera method could otherwise slip in. Days without a session are
// left out rather than counted as zero — a rest day is not a bad day, and a
// median of zeros would make every working day look exceptional.
//
// Below five such days there is no "usual" yet.
//
// After a scoring change the method in use starts with no scored days. Until
// it has five, the usual of the most recent earlier method that has five is
// returned with `onEarlierMethod: true` (one method, never a mix). The Lab
// shows it as a labelled reference without a +/− delta: the methods read
// differently (V5 Deep Focus higher, average attention lower for the same
// work), so a delta would show progress that is partly a measurement effect.
// Chosen by the user on 10 Oct 2026 over three days of an empty Lab.
import { getFocusPeriodWindow } from './focusMetric'
import { buildVersionedFocusPeriod } from './focusMetricV2'
import { FOCUS_SCORE } from './focusScore'
import { buildPeriodTimeSummary } from './dashboardData'
import { activeFocusGeneration } from './historyTrend'

export const BASELINE_WINDOW_DAYS = 28
export const BASELINE_MIN_DAYS = 5

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function medianIfEnough(values) {
  return values.length >= BASELINE_MIN_DAYS ? median(values) : null
}

/**
 * The usual day before `dayStart`: { days, focusScore, deepFocusSeconds,
 * averageAttention, onEarlierMethod, currentMethodDays, required }, each value
 * a median, or null when no single method has five scored days in the window.
 * A value is also null on its own when fewer than five of those days carry it.
 * `onEarlierMethod` marks a usual read on an earlier method while the current
 * one still has fewer than five days; it is a reference, never a comparison.
 */
export function buildDayBaseline(options) {
  const days = scoredDays(options)
  const current = days.filter(day => day.current)
  if (current.length >= BASELINE_MIN_DAYS) {
    return usualOf(current, { onEarlierMethod: false, currentMethodDays: current.length })
  }
  const earlier = mostRecentEarlierMethod(days.filter(day => !day.current))
  return earlier
    ? usualOf(earlier, { onEarlierMethod: true, currentMethodDays: current.length })
    : null
}

function usualOf(days, extra) {
  const finite = key => days.map(day => day[key]).filter(Number.isFinite)
  return {
    days: days.length,
    focusScore: median(days.map(day => day.score)),
    deepFocusSeconds: medianIfEnough(finite('deepFocusSeconds')),
    averageAttention: medianIfEnough(finite('averageAttention')),
    required: BASELINE_MIN_DAYS,
    ...extra,
  }
}

// The earlier method whose latest scored day is most recent among those with
// enough days. Days arrive newest first, so Map insertion order is recency.
function mostRecentEarlierMethod(days) {
  const byGeneration = new Map()
  for (const day of days) {
    if (!byGeneration.has(day.generation)) byGeneration.set(day.generation, [])
    byGeneration.get(day.generation).push(day)
  }
  return [...byGeneration.values()].find(group => group.length >= BASELINE_MIN_DAYS) || null
}

/**
 * Why there is no usual yet, so the Lab can say so instead of the comparison
 * silently disappearing: { days, required, earlierMethodDays }. After a
 * scoring change `earlierMethodDays` counts the scored days in the window that
 * used an earlier method. They are never compared with the new one; the usual
 * returns once the new method has `required` scored days of its own.
 */
export function buildDayBaselineProgress(options) {
  const days = scoredDays(options)
  return {
    days: days.filter(day => day.current).length,
    required: BASELINE_MIN_DAYS,
    earlierMethodDays: days.filter(day => !day.current).length,
  }
}

// Every scored day in the window before `dayStart`, newest first, each read on
// its own method: { generation, current, score, averageAttention,
// deepFocusSeconds }.
function scoredDays({ ledger, sessions = [], dayStart, now = Date.now(), metricVersion = FOCUS_SCORE.metricVersion }) {
  const reference = new Date(dayStart ?? now)
  const generation = activeFocusGeneration(sessions)
  const days = []
  for (let offset = 1; offset <= BASELINE_WINDOW_DAYS; offset += 1) {
    const { start } = getFocusPeriodWindow('day', -offset, reference)
    const period = buildVersionedFocusPeriod(ledger, {
      range: 'day',
      periodStart: start.getTime(),
      now,
      sessions,
      metricVersion,
    })
    if (period?.score == null) continue
    const time = buildPeriodTimeSummary(sessions, period, now)
    days.push({
      generation: period.generation,
      current: period.generation === generation,
      score: period.score,
      averageAttention: Number.isFinite(period.averageAttention) ? period.averageAttention : null,
      deepFocusSeconds: Number.isFinite(time.deepFocusSeconds) ? time.deepFocusSeconds : null,
    })
  }
  return days
}
