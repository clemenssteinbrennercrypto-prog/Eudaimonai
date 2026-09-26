// Focus Metric V3 answers one question only: how strong was attention while it
// was actually measured? Time is reported alongside it, never hidden inside
// the score. V1/V2 remain readable and their stored values are not rewritten.
import { buildFocusPeriod } from './focusMetric'

export const FOCUS_METRIC_V3 = Object.freeze({
  version: 3,
})

function qualityDay(day) {
  if (day?.status !== 'measured' || !Number.isFinite(day.measuredSeconds) || day.measuredSeconds <= 0 ||
    !Number.isFinite(day.scoreSum) || day.scoreSum < 0 || day.scoreSum > day.measuredSeconds * 100) return day
  const rawScore = day.scoreSum / day.measuredSeconds
  return {
    ...day,
    metricVersion: FOCUS_METRIC_V3.version,
    rawScore,
    score: Math.round(rawScore),
    efficiency: Math.round(rawScore),
  }
}

export function buildFocusPeriodV3(ledger, options = {}) {
  // V1 owns the validated ledger boundary, five-minute eligibility rule and
  // camera-generation isolation. Only its duration-weighted result is replaced.
  const validated = buildFocusPeriod(ledger, options)
  const days = validated.days.map(qualityDay)
  const measuredDays = days.filter(day => day.status === 'measured')
  const measuredSeconds = measuredDays.reduce((sum, day) => sum + day.measuredSeconds, 0)
  const scoreSum = measuredDays.reduce((sum, day) => sum + day.scoreSum, 0)
  const rawScore = measuredSeconds > 0 ? scoreSum / measuredSeconds : null
  const todayKey = validated.today?.key

  return {
    ...validated,
    metricVersion: FOCUS_METRIC_V3.version,
    calculationSource: 'qualified_ledger_attention_quality_v1',
    days,
    today: todayKey ? days.find(day => day.key === todayKey) ?? null : null,
    rawScore,
    score: rawScore == null ? null : Math.round(rawScore),
    efficiency: rawScore == null ? null : Math.round(rawScore),
    // A V1/V2 baseline is a different construct. V3 starts its own history
    // instead of presenting a mathematically invalid comparison.
    baseline: null,
  }
}
