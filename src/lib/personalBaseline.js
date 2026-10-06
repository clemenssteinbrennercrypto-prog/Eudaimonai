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
// Below five such days there is no "usual" yet, and the baseline says nothing.
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
 * averageAttention }, each a median, or null when fewer than five scored days
 * exist in the window. A value is also null on its own when fewer than five
 * of those days carry it.
 */
export function buildDayBaseline({ ledger, sessions = [], dayStart, now = Date.now(), metricVersion = FOCUS_SCORE.metricVersion }) {
  const reference = new Date(dayStart ?? now)
  const generation = activeFocusGeneration(sessions)
  const scores = []
  const deepFocus = []
  const attention = []
  for (let offset = 1; offset <= BASELINE_WINDOW_DAYS; offset += 1) {
    const { start } = getFocusPeriodWindow('day', -offset, reference)
    const period = buildVersionedFocusPeriod(ledger, {
      range: 'day',
      periodStart: start.getTime(),
      now,
      sessions,
      metricVersion,
    })
    if (period?.score == null || period.generation !== generation) continue
    scores.push(period.score)
    if (Number.isFinite(period.averageAttention)) attention.push(period.averageAttention)
    const time = buildPeriodTimeSummary(sessions, period, now)
    if (Number.isFinite(time.deepFocusSeconds)) deepFocus.push(time.deepFocusSeconds)
  }
  if (scores.length < BASELINE_MIN_DAYS) return null
  return {
    days: scores.length,
    focusScore: median(scores),
    deepFocusSeconds: medianIfEnough(deepFocus),
    averageAttention: medianIfEnough(attention),
  }
}
