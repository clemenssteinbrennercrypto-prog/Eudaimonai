// The current Focus Score measures accumulated, quality-qualified work.
// Measured time is the volume, mean attention decides what that time is worth,
// and exact Deep Focus adds a deliberately modest continuity bonus.
//
// Exact Deep Focus is forward-recorded. This ruler therefore starts at the
// first qualifying contribution carrying deepFocusTimeVersion 2 and never
// invents a value for older history. V1–V3 remain readable and unchanged.
import { ALERT_SCORE, FLOW_SCORE } from './attention'
import { DEEP_FOCUS_TIME_VERSION } from './attentionSampling'
import { buildFocusPeriod, localDayKey, usableDayContributions } from './focusMetric'

const FIXED_WORKDAYS = Object.freeze([1, 2, 3, 4, 5])

export const FOCUS_SCORE = Object.freeze({
  metricVersion: 4,
  // Effective minutes per elapsed fixed weekday that earn a score of 50.
  referenceMinutesPerWorkday: 80,
  // A value above 1 softens the first minutes before diminishing returns take
  // over. This keeps micro-sessions from receiving disproportionate credit.
  curveExponent: 1.3,
  // Exact Deep Focus is a bonus, not a third copy of the attention signal.
  deepFocusBonus: 0.25,
  qualityFloor: ALERT_SCORE,
  qualityCeiling: FLOW_SCORE,
  exactDeepFocusVersion: DEEP_FOCUS_TIME_VERSION,
  fixedWorkdays: FIXED_WORKDAYS,
})

const finiteNonNegative = value => Number.isFinite(value) && value >= 0
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

/** Attention below the alert band earns no volume credit; Flow-quality mean
 * attention earns full credit. Values between those named product bands scale
 * linearly so the multiplier remains legible and versionable. */
export function focusQualityFactor(averageAttention) {
  if (!Number.isFinite(averageAttention) || averageAttention < 0 || averageAttention > 100) return null
  return clamp(
    (averageAttention - FOCUS_SCORE.qualityFloor) /
      (FOCUS_SCORE.qualityCeiling - FOCUS_SCORE.qualityFloor),
    0,
    1
  )
}

/** Continuous, strictly increasing in effective minutes, 50 at the reference
 * and asymptotic to 100. The Hill exponent produces a gentle start, then
 * diminishing returns, so micro-sessions earn little while long focus days
 * remain distinguishable. */
export function focusScoreFromEffectiveMinutes(effectiveMinutes, referenceMinutes) {
  if (!finiteNonNegative(effectiveMinutes) || !Number.isFinite(referenceMinutes) || referenceMinutes <= 0) return null
  const ratio = Math.pow(effectiveMinutes / referenceMinutes, FOCUS_SCORE.curveExponent)
  return 100 * ratio / (1 + ratio)
}

function exactDeepFocus(item) {
  if (
    item?.deepFocusTimeVersion !== FOCUS_SCORE.exactDeepFocusVersion ||
    !finiteNonNegative(item?.flowSeconds) ||
    !finiteNonNegative(item?.measuredSeconds) ||
    item.flowSeconds > item.measuredSeconds
  ) return null
  return Math.min(item.measuredSeconds, item.flowSeconds)
}

function totalsFromContributions(contributions) {
  const totals = { measuredSeconds: 0, scoreSum: 0, deepFocusSeconds: 0, sessionCount: 0 }
  for (const item of contributions) {
    const deepFocusSeconds = exactDeepFocus(item)
    if (deepFocusSeconds == null) return null
    totals.measuredSeconds += item.measuredSeconds
    totals.scoreSum += item.scoreSum
    totals.deepFocusSeconds += deepFocusSeconds
    totals.sessionCount += 1
  }
  if (
    totals.measuredSeconds <= 0 ||
    totals.scoreSum < 0 ||
    totals.scoreSum > totals.measuredSeconds * 100 ||
    totals.deepFocusSeconds > totals.measuredSeconds
  ) return null
  return totals
}

/** Convert validated raw inputs into the three explicit score components. */
export function focusCreditFromTotals({ measuredSeconds, scoreSum, deepFocusSeconds } = {}) {
  if (
    !finiteNonNegative(measuredSeconds) || measuredSeconds <= 0 ||
    !finiteNonNegative(scoreSum) || scoreSum > measuredSeconds * 100 ||
    !finiteNonNegative(deepFocusSeconds) || deepFocusSeconds > measuredSeconds
  ) return null
  const averageAttention = scoreSum / measuredSeconds
  const qualityFactor = focusQualityFactor(averageAttention)
  if (qualityFactor == null) return null
  const volumeSeconds = measuredSeconds + FOCUS_SCORE.deepFocusBonus * Math.min(measuredSeconds, deepFocusSeconds)
  return {
    measuredSeconds,
    scoreSum,
    deepFocusSeconds: Math.min(measuredSeconds, deepFocusSeconds),
    averageAttention,
    qualityFactor,
    effectiveSeconds: volumeSeconds * qualityFactor,
  }
}

/** One day on its validated camera ruler. Missing exact Flow is refused rather
 * than replaced with phase time or the older weighted estimate. */
export function dayFocusCredit(dayEntry) {
  const usable = usableDayContributions(dayEntry)
  if (!usable) return null
  const totals = totalsFromContributions(usable.contributions)
  if (!totals) return { generation: usable.generation, refused: true }
  return { generation: usable.generation, ...totals, ...focusCreditFromTotals(totals) }
}

function metricStartFor(ledger, generation, todayKey) {
  const first = Object.entries(ledger.days)
    .filter(([key]) => key <= todayKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .find(([, entry]) => {
      const usable = usableDayContributions(entry)
      return usable?.generation === generation && usable.contributions.some(item => exactDeepFocus(item) != null)
    })
  if (!first) return null
  const [key, entry] = first
  const usable = usableDayContributions(entry)
  const exactStarts = usable.contributions
    .filter(item => exactDeepFocus(item) != null && Number.isFinite(item.startedAt))
    .map(item => item.startedAt)
  return { key, startedAt: exactStarts.length > 0 ? Math.min(...exactStarts) : null }
}

function metricContributionsForDay(dayEntry, { dayKey, generation, metricStart }) {
  const usable = usableDayContributions(dayEntry)
  if (!usable || usable.generation !== generation) return null
  if (dayKey !== metricStart?.key || !Number.isFinite(metricStart.startedAt)) return usable

  let ambiguous = false
  const contributions = usable.contributions.filter(item => {
    // Carrying exact V2 time proves that the session belongs to the new ruler.
    if (exactDeepFocus(item) != null) return true
    if (!Number.isFinite(item.startedAt)) {
      ambiguous = true
      return true
    }
    return item.startedAt >= metricStart.startedAt
  })
  return { ...usable, contributions, ambiguous }
}

function scoreFor(totals, referenceWorkdays) {
  const credit = focusCreditFromTotals(totals)
  if (!credit) return null
  const referenceMinutes = FOCUS_SCORE.referenceMinutesPerWorkday * referenceWorkdays
  const rawScore = focusScoreFromEffectiveMinutes(credit.effectiveSeconds / 60, referenceMinutes)
  return { ...credit, rawScore, score: Math.round(rawScore), referenceMinutes }
}

export function buildFocusScorePeriod(ledger, options = {}) {
  const requestedNow = new Date(options.now ?? Date.now())
  const now = Number.isNaN(requestedNow.getTime()) ? new Date() : requestedNow
  // V1 owns record validation, five-minute eligibility, period windows and
  // camera-generation isolation. Only the derived score is replaced.
  const validated = buildFocusPeriod(ledger, { ...options, now })
  const safeLedger = ledger?.schemaVersion === 1 && ledger.days ? ledger : { days: {} }
  const todayKey = localDayKey(now)
  const metricStart = metricStartFor(safeLedger, validated.generation, todayKey)
  const metricStartKey = metricStart?.key ?? null

  let refused = false
  let referenceWorkdays = 0
  let measuredDays = 0
  const totals = { measuredSeconds: 0, scoreSum: 0, deepFocusSeconds: 0, sessionCount: 0 }
  const attentionTotals = { measuredSeconds: 0, scoreSum: 0 }
  const days = validated.days.map(day => {
    const elapsed = day.status !== 'future' && day.key <= todayKey
    const beforeMetric = metricStartKey != null && day.key < metricStartKey
    const awaitingMetric = metricStartKey == null && day.status === 'measured'
    const planned = elapsed && metricStartKey != null && !beforeMetric &&
      FOCUS_SCORE.fixedWorkdays.includes(day.date.getDay())
    if (planned) referenceWorkdays += 1
    const base = { ...day, metricVersion: FOCUS_SCORE.metricVersion, plannedWorkday: planned }
    if ((beforeMetric && day.status === 'measured') || awaitingMetric) {
      return { ...base, status: awaitingMetric ? 'awaiting_metric' : 'before_metric', score: null, rawScore: null }
    }
    if (day.status !== 'measured') return base
    const selected = metricContributionsForDay(safeLedger.days[day.key], {
      dayKey: day.key,
      generation: validated.generation,
      metricStart,
    })
    if (!selected || selected.contributions.length === 0) return base
    for (const item of selected.contributions) {
      attentionTotals.measuredSeconds += item.measuredSeconds
      attentionTotals.scoreSum += item.scoreSum
    }
    const selectedTotals = selected.ambiguous ? null : totalsFromContributions(selected.contributions)
    const credit = selectedTotals == null
      ? { generation: selected.generation, refused: true }
      : { generation: selected.generation, ...selectedTotals, ...focusCreditFromTotals(selectedTotals) }
    if (credit.refused) {
      refused = true
      return { ...base, status: 'unscorable', score: null, rawScore: null }
    }
    measuredDays += 1
    for (const key of Object.keys(totals)) totals[key] += credit[key]
    return { ...base, ...credit, ...scoreFor(credit, 1) }
  })

  const effectiveReferenceWorkdays = Math.max(1, referenceWorkdays)
  const scored = !refused && measuredDays > 0
    ? scoreFor(totals, effectiveReferenceWorkdays)
    : null
  const averageAttention = attentionTotals.measuredSeconds > 0
    ? attentionTotals.scoreSum / attentionTotals.measuredSeconds
    : null
  const selectedStartKey = localDayKey(validated.start)
  const metricStartMs = metricStartKey == null ? null : Number.isFinite(metricStart?.startedAt)
    ? metricStart.startedAt
    : new Date(`${metricStartKey}T00:00:00`).getTime()
  const totalMeasuredDays = metricStartKey == null ? 0 : Object.entries(safeLedger.days)
    .filter(([key]) => key >= metricStartKey && key <= todayKey)
    .filter(([key, entry]) => {
      const selected = metricContributionsForDay(entry, {
        dayKey: key,
        generation: validated.generation,
        metricStart,
      })
      return selected && !selected.ambiguous && totalsFromContributions(selected.contributions) != null
    }).length
  const beforeMetricPeriod = scored == null && !refused && days.some(day => day.status === 'before_metric') &&
    !days.some(day => ['measured', 'unscorable', 'awaiting_metric'].includes(day.status))

  return {
    ...validated,
    metricVersion: FOCUS_SCORE.metricVersion,
    calculationSource: 'qualified_measured_time_attention_and_exact_deep_focus',
    days,
    today: days.find(day => day.key === todayKey) ?? null,
    rawScore: scored?.rawScore ?? null,
    score: scored?.score ?? null,
    refusal: refused ? 'missing_exact_deep_focus' : null,
    metricStartKey,
    metricStartAt: metricStartMs,
    beforeMetricPeriod,
    partialMetricPeriod: metricStartKey != null && selectedStartKey < metricStartKey &&
      validated.endExclusive.getTime() > metricStartMs,
    referenceWorkdays: effectiveReferenceWorkdays,
    referenceMinutes: scored?.referenceMinutes ?? null,
    effectiveMinutes: scored ? scored.effectiveSeconds / 60 : null,
    averageAttention,
    qualityFactor: scored?.qualityFactor ?? null,
    deepFocusSeconds: scored?.deepFocusSeconds ?? null,
    measuredSeconds: attentionTotals.measuredSeconds,
    totalMeasuredDays,
    baseline: null,
  }
}
