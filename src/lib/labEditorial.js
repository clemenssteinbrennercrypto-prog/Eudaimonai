// One editorial line for the Lab, set in the serif. It states a single fact
// about the selected period and nothing else: which measured session had the
// highest average attention. It never infers a reason ("you focus best in the
// morning") — calibration.js owns patterns and refuses them on thin data —
// and it stays silent when no session in the period carries a validated
// attention value, so an unmeasured session can never be called the best.
import { FOCUS_METRIC_V1 } from './focusMetric'
import { sessionStartedAt } from './sessionTiming'
import { fmtDuration } from './sessionAnalysisPresentation'

const RANGE_NOUN = { day: 'day', week: 'week', month: 'month' }

export function measuredSessionAttention(session) {
  return session?.focusMetricVersion === FOCUS_METRIC_V1.version &&
    session?.focusMetricRejection == null &&
    Number.isFinite(session?.sessionEfficiency) &&
    session.sessionEfficiency >= 0 && session.sessionEfficiency <= 100
    ? session.sessionEfficiency
    : null
}

export function buildLabEditorialLine(sessions, { start, endExclusive, range, now = Date.now() } = {}) {
  const from = start instanceof Date ? start.getTime() : Number.NaN
  const to = endExclusive instanceof Date ? endExclusive.getTime() : Number.NaN
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  const measured = (Array.isArray(sessions) ? sessions : [])
    .filter(session => {
      const startedAt = sessionStartedAt(session)
      return Number.isFinite(startedAt) && startedAt >= from && startedAt < to && startedAt <= now
    })
    .map(session => ({ session, attention: measuredSessionAttention(session) }))
    .filter(({ attention, session }) => attention != null &&
      Number.isFinite(session?.actualSeconds) && session.actualSeconds > 0)
  if (measured.length === 0) return null

  const best = measured.reduce((top, entry) =>
    entry.attention > top.attention ||
    (entry.attention === top.attention && entry.session.actualSeconds > top.session.actualSeconds)
      ? entry
      : top)
  const task = String(best.session.task || '').trim() || 'Untitled session'
  const facts = `${task}, ${fmtDuration(best.session.actualSeconds)} at attention ${Math.round(best.attention)}.`
  if (measured.length === 1) return `One measured session: ${facts}`
  return `Best session of the ${RANGE_NOUN[range] || 'period'}: ${facts}`
}
