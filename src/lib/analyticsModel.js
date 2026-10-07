import {
  MIN_MEANINGFUL_GAP_PCT,
  MIN_PER_BUCKET,
  MIN_SESSIONS,
} from './calibration'
import {
  aggregateAverageFocus,
  aggregateDeepFocusTime,
  evidenceFocusGeneration,
  sessionAverageFocus,
  sessionFocusMeasurement,
} from './historyTrend'
import { SCOREABLE_SCORING_VERSIONS } from './focusMetric'
import { sessionStartedAt } from './sessionTiming'

export const DETAILS_MIN_SESSION_SECONDS = 10 * 60
export const OVERVIEW_RANGES = Object.freeze({
  week: 7,
  month: 30,
  all: null,
})

export function normalizedOutcome(session) {
  if (session?.goalOutcome === 'yes' || session?.goalOutcome === 'partly' || session?.goalOutcome === 'no') {
    return session.goalOutcome
  }
  if (session?.goalAchieved === true) return 'yes'
  if (session?.goalAchieved === false) return 'no'
  return null
}

function timestampOf(session) {
  return Number.isFinite(session?.timestamp) ? session.timestamp : -Infinity
}

/**
 * Analytics comparisons refuse records without an explicit, supported ruler.
 * historyTrend intentionally interprets some pre-version history as V1 for
 * display/migration; cross-session claims are stricter because they compare days.
 */
export function knownMeasurementSessions(sessions = []) {
  return (Array.isArray(sessions) ? sessions : [])
    .filter(session => SCOREABLE_SCORING_VERSIONS.includes(session?.attentionScoringVersion))
    .sort((a, b) => timestampOf(b) - timestampOf(a))
}

export function knownComparableSessions(sessions = []) {
  const known = knownMeasurementSessions(sessions)
  if (known.length === 0) return []

  const newest = known[0]
  return known
    .filter(session => session.attentionScoringVersion === newest.attentionScoringVersion)
}

/**
 * The Overview is intentionally a factual snapshot rather than an inference.
 * Focus time and session count include every stored session in the selected
 * window. Average attention still delegates to the version-aware aggregator,
 * so changing the range can never blend camera generations into one number.
 */
export function buildOverviewSnapshot(sessions = [], range = 'month', now = Date.now()) {
  const days = Object.prototype.hasOwnProperty.call(OVERVIEW_RANGES, range)
    ? OVERVIEW_RANGES[range]
    : OVERVIEW_RANGES.month
  const cutoff = days == null ? null : now - days * 86400000
  const selected = (Array.isArray(sessions) ? sessions : [])
    .filter(Boolean)
    .filter(session => cutoff == null || (Number.isFinite(session.timestamp) && session.timestamp >= cutoff))

  // Average attention reads one generation. Right after a scoring change the
  // new one may hold a single session, which "All time" would then present as
  // the whole history; until it has MIN_SESSIONS measured sessions in the
  // range, the most recent earlier generation that has is shown instead.
  const known = knownMeasurementSessions(selected)
  const evidence = evidenceFocusGeneration(known, {
    minCount: MIN_SESSIONS,
    isUsable: session => sessionFocusMeasurement(session) != null,
  })
  const attentionSessions = known.filter(session => session.attentionScoringVersion === evidence.generation)

  return {
    range: Object.prototype.hasOwnProperty.call(OVERVIEW_RANGES, range) ? range : 'month',
    focusSeconds: selected.reduce((sum, session) => (
      sum + (Number.isFinite(session.actualSeconds) && session.actualSeconds > 0 ? session.actualSeconds : 0)
    ), 0),
    averageAttention: aggregateAverageFocus(attentionSessions),
    averageAttentionOnCurrentMethod: known.length === 0 || evidence.isActive,
    sessionCount: selected.length,
  }
}

export function buildInterventionSummary(sessions = []) {
  const comparable = knownComparableSessions(sessions)
  const summary = comparable.reduce((summary, session) => {
    const interventions = session.phaseInterventions
    summary.sessions += 1
    summary.gentleReminders += Number.isFinite(interventions?.gentleReminders) ? interventions.gentleReminders : 0
    summary.preDriftNudges += Number.isFinite(interventions?.preDriftNudges) ? interventions.preDriftNudges : 0
    summary.alerts += Number.isFinite(session.distractionEvents)
      ? session.distractionEvents
      : Array.isArray(session.distractionLog) ? session.distractionLog.length : 0
    if (Array.isArray(session.protectionEvents)) {
      summary.protectionTrackedSessions += 1
      summary.protectionEvents += session.protectionEvents.length
    }
    return summary
  }, {
    sessions: 0,
    gentleReminders: 0,
    preDriftNudges: 0,
    alerts: 0,
    protectionEvents: 0,
    protectionTrackedSessions: 0,
  })
  return {
    ...summary,
    protectionEvents: summary.protectionTrackedSessions > 0 ? summary.protectionEvents : null,
  }
}

function quantile(sorted, position) {
  if (!sorted.length) return null
  const index = (sorted.length - 1) * position
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower)
}

export function buildFocusDistribution(sessions = []) {
  const values = knownComparableSessions(sessions)
    .map(sessionAverageFocus)
    .filter(value => value != null)
    .sort((a, b) => a - b)
  return {
    values,
    count: values.length,
    mean: values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
    median: values.length ? Math.round(quantile(values, 0.5)) : null,
    q1: values.length ? Math.round(quantile(values, 0.25)) : null,
    q3: values.length ? Math.round(quantile(values, 0.75)) : null,
  }
}

export function buildAnalyticsStory(sessions = []) {
  const safe = Array.isArray(sessions) ? sessions : []
  return {
    unratedSessions: [...safe]
      .filter(session => !normalizedOutcome(session))
      .sort((a, b) => timestampOf(b) - timestampOf(a)),
    interventions: buildInterventionSummary(safe),
  }
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function partOfDay(session) {
  const startedAt = sessionStartedAt(session)
  if (startedAt == null) return null
  const date = new Date(startedAt)
  if (Number.isNaN(date.getTime())) return null
  const hour = date.getHours()
  if (hour >= 6 && hour < 9) return { id: 'early', label: 'Early morning' }
  if (hour >= 9 && hour < 12) return { id: 'morning', label: 'Late morning' }
  if (hour >= 12 && hour < 15) return { id: 'midday', label: 'Midday' }
  if (hour >= 15 && hour < 18) return { id: 'afternoon', label: 'Afternoon' }
  if (hour >= 18 && hour < 22) return { id: 'evening', label: 'Evening' }
  return { id: 'night', label: 'Late night' }
}

export const DETAILS_TIME_BUCKETS = [
  { id: 'early', label: 'Early morning', range: '06–09' },
  { id: 'morning', label: 'Late morning', range: '09–12' },
  { id: 'midday', label: 'Midday', range: '12–15' },
  { id: 'afternoon', label: 'Afternoon', range: '15–18' },
  { id: 'evening', label: 'Evening', range: '18–22' },
  { id: 'night', label: 'Late night', range: '22–06' },
]

/**
 * One filter contract for every Details chart. Keeping this pure prevents a
 * chart from quietly answering on a different range than the controls above
 * it. The newest explicit measurement generation is selected before any
 * averages are produced; missing versions remain refused. Details keeps older
 * explicit generations visible so history does not disappear, while its
 * summary model still isolates every comparison to one generation.
 */
export function filterDetailsSessions(sessions = [], filters = {}) {
  const {
    range = 'all',
    outcome = 'all',
    workspace = 'all',
    now = Date.now(),
  } = filters
  const cutoff = range === '30'
    ? now - 30 * 86400000
    : range === '90' ? now - 90 * 86400000 : null

  return knownMeasurementSessions(sessions).filter(session => {
    if (cutoff && (!Number.isFinite(session.timestamp) || session.timestamp < cutoff)) return false
    if (outcome !== 'all' && (normalizedOutcome(session) || 'unrated') !== outcome) return false
    if (workspace !== 'all' && session.workspace?.id !== workspace) return false
    return true
  })
}

function detailsExclusion(session) {
  if (session?.trackingFaulted === true) return 'tracking_fault'
  if (!(session?.actualSeconds >= DETAILS_MIN_SESSION_SECONDS)) return 'short_session'
  const measurement = sessionFocusMeasurement(session)
  if (!measurement || sessionAverageFocus(session) == null) return 'unmeasured'
  if (!(measurement?.measuredSeconds >= DETAILS_MIN_SESSION_SECONDS)) return 'short_measurement'
  if (!Number.isFinite(session?.timestamp)) return 'invalid_time'
  return null
}

export function isDetailsUsable(session) {
  return detailsExclusion(session) == null
}

function conditionRows(sessions, keyFor, order = null) {
  const buckets = new Map()
  for (const session of sessions) {
    if (!isDetailsUsable(session)) continue
    const key = keyFor(session)
    const attention = sessionAverageFocus(session)
    if (!key?.id || attention == null) continue
    if (!buckets.has(key.id)) buckets.set(key.id, { ...key, values: [], sessions: [] })
    const bucket = buckets.get(key.id)
    bucket.values.push(attention)
    bucket.sessions.push(session)
  }

  const rows = [...buckets.values()]
    .map(bucket => ({
      id: bucket.id,
      label: bucket.label,
      range: bucket.range,
      sessions: bucket.sessions.length,
      averageAttention: bucket.sessions.length >= MIN_PER_BUCKET
        ? Math.round(mean(bucket.values))
        : null,
      outcomeRate: outcomeFitForDetails(bucket.sessions),
    }))

  if (Array.isArray(order)) {
    const orderById = new Map(order.map((item, index) => [item.id, index]))
    rows.sort((a, b) => (orderById.get(a.id) ?? Infinity) - (orderById.get(b.id) ?? Infinity))
  } else {
    rows.sort((a, b) => (b.averageAttention ?? -1) - (a.averageAttention ?? -1) || b.sessions - a.sessions)
  }
  return rows
}

function outcomeFitForDetails(sessions) {
  const rated = sessions.filter(session => normalizedOutcome(session))
  if (rated.length < MIN_PER_BUCKET) return null
  const reached = rated.filter(session => normalizedOutcome(session) === 'yes').length
  return Math.round((reached / rated.length) * 100)
}

function conditionComparison(rows, usableCount) {
  const qualified = rows.filter(row => row.averageAttention != null)
  if (usableCount < MIN_SESSIONS || qualified.length < 2) {
    return { ready: false, best: null, worst: null }
  }
  const ranked = [...qualified].sort((a, b) => b.averageAttention - a.averageAttention)
  const best = ranked[0]
  const worst = ranked[ranked.length - 1]
  const meaningful = best.averageAttention - worst.averageAttention >= MIN_MEANINGFUL_GAP_PCT
  return { ready: true, best: meaningful ? best : null, worst: meaningful ? worst : null }
}

const PHASE_ORDER = ['arrival', 'ramp', 'lock_in', 'fade', 'recovery', 'drift']

function phaseSummary(sessions) {
  const seconds = Object.fromEntries(PHASE_ORDER.map(phase => [phase, 0]))
  let tracedSessions = 0
  for (const session of sessions) {
    const stored = session.focusPhases?.seconds
    if (!stored || typeof stored !== 'object') continue
    let sessionHasPhase = false
    for (const phase of PHASE_ORDER) {
      const value = stored[phase]
      if (!Number.isFinite(value) || value <= 0) continue
      seconds[phase] += value
      sessionHasPhase = true
    }
    if (sessionHasPhase) tracedSessions += 1
  }
  const totalSeconds = Object.values(seconds).reduce((sum, value) => sum + value, 0)
  return {
    tracedSessions,
    totalSeconds,
    deepFocus: aggregateDeepFocusTime(sessions),
    rows: PHASE_ORDER
      .filter(phase => seconds[phase] > 0)
      .map(phase => ({
        id: phase,
        seconds: seconds[phase],
        sharePct: totalSeconds ? Math.round((seconds[phase] / totalSeconds) * 100) : 0,
      })),
  }
}

function durationAttentionSummary(rows) {
  if (!rows.length) {
    return { count: 0, medianDurationMinutes: null, medianAttention: null, trend: null }
  }
  const durations = rows.map(row => row.durationMinutes).sort((a, b) => a - b)
  const attentions = rows.map(row => row.averageAttention).sort((a, b) => a - b)
  let trend = null

  // A Theil-Sen line is deliberately used instead of ordinary least squares:
  // one unusually long or unusually weak session should not rotate the whole
  // relationship. Eight sessions is the existing minimum evidence floor; the
  // numeric slope stays descriptive and is never presented as causation.
  if (rows.length >= MIN_SESSIONS) {
    const slopes = []
    for (let left = 0; left < rows.length; left += 1) {
      for (let right = left + 1; right < rows.length; right += 1) {
        const durationGap = rows[right].durationMinutes - rows[left].durationMinutes
        if (durationGap === 0) continue
        slopes.push((rows[right].averageAttention - rows[left].averageAttention) / durationGap)
      }
    }
    if (slopes.length > 0) {
      slopes.sort((a, b) => a - b)
      const slope = quantile(slopes, 0.5)
      const intercepts = rows
        .map(row => row.averageAttention - slope * row.durationMinutes)
        .sort((a, b) => a - b)
      const intercept = quantile(intercepts, 0.5)
      const minDuration = durations[0]
      const maxDuration = durations.at(-1)
      const attentionAt = duration => Math.max(0, Math.min(100, intercept + slope * duration))
      trend = {
        minDuration,
        maxDuration,
        startAttention: attentionAt(minDuration),
        endAttention: attentionAt(maxDuration),
        pointsPer30Minutes: Math.round(slope * 30 * 10) / 10,
      }
    }
  }

  return {
    count: rows.length,
    medianDurationMinutes: quantile(durations, 0.5),
    medianAttention: Math.round(quantile(attentions, 0.5)),
    trend,
  }
}

/**
 * The single view-model for Analytics → Details. It contains facts that can be
 * shown immediately and explicit qualification states for cross-session
 * claims. It deliberately has no activity, intervention, energy, planned-time,
 * output, or score-component inference.
 */
export function buildDetailsSummary(sessions = []) {
  const visible = knownMeasurementSessions(sessions)
  const currentGeneration = visible[0]?.attentionScoringVersion ?? null
  // The charts below read one generation: the current one once it has
  // MIN_SESSIONS qualified sessions, until then the most recent earlier one
  // that has (evidenceFocusGeneration). The trend above keeps every generation
  // as its own series either way.
  const evidence = detailsEvidence(visible)
  const chartGeneration = visible.length ? evidence.generation : null
  const comparable = visible.filter(session => session.attentionScoringVersion === chartGeneration)
  const qualified = comparable.filter(isDetailsUsable)
  const distribution = buildFocusDistribution(qualified)
  const outcomes = { yes: 0, partly: 0, no: 0, unrated: 0 }
  for (const session of visible) outcomes[normalizedOutcome(session) || 'unrated'] += 1

  const timeline = [...visible].reverse().map(session => ({
    id: session.id,
    timestamp: sessionStartedAt(session) ?? session.timestamp,
    averageAttention: sessionAverageFocus(session),
    outcome: normalizedOutcome(session),
    durationMinutes: Number.isFinite(session.actualSeconds) && session.actualSeconds > 0
      ? session.actualSeconds / 60
      : null,
    workspace: session.workspace?.name || null,
    generation: session.attentionScoringVersion,
    currentGeneration: session.attentionScoringVersion === currentGeneration,
    qualified: session.attentionScoringVersion === chartGeneration && isDetailsUsable(session),
    scoreEligible: isDetailsUsable(session),
    exclusion: detailsExclusion(session),
    trackingFaulted: session.trackingFaulted === true,
  }))
  const measured = timeline.filter(row => row.averageAttention != null)
  const qualifiedMeasured = measured.filter(row => row.qualified)
  const duration = qualifiedMeasured.filter(row => row.durationMinutes != null)
  const usableCount = qualified.length

  const timeRows = conditionRows(
    comparable,
    session => {
      const bucket = partOfDay(session)
      const definition = DETAILS_TIME_BUCKETS.find(item => item.id === bucket?.id)
      return definition || bucket
    },
    DETAILS_TIME_BUCKETS,
  )
  // One row per workspace, whatever its layout revision: editing the desk
  // layout is the same place to the user, and per-revision rows read as
  // "Desk v2 / Desk v3 / Desk v4". Sessions arrive newest first, so the row
  // carries the workspace's current name.
  const workspaceRows = conditionRows(comparable, session => session.workspace?.id
    ? {
        id: session.workspace.id,
        label: session.workspace.name || session.workspace.id,
      }
    : null)

  return {
    generation: currentGeneration,
    chartGeneration,
    chartsOnCurrentMethod: chartGeneration === currentGeneration,
    currentMethodQualified: evidence.activeCount,
    chartsMethodLastTimestamp: evidence.lastTimestamp,
    sessionCount: visible.length,
    measuredCount: measured.length,
    scoreableCount: qualifiedMeasured.length,
    timeline,
    distribution: {
      ...distribution,
      sessions: qualifiedMeasured,
    },
    outcomes,
    conditions: {
      usableCount,
      required: MIN_SESSIONS,
      timeOfDay: {
        rows: DETAILS_TIME_BUCKETS.map(definition =>
          timeRows.find(row => row.id === definition.id) || { ...definition, sessions: 0, averageAttention: null, outcomeRate: null }),
        comparison: conditionComparison(timeRows, usableCount),
      },
      workspace: {
        rows: workspaceRows,
        comparison: conditionComparison(workspaceRows, usableCount),
      },
    },
    duration,
    durationAnalysis: durationAttentionSummary(duration),
    phases: phaseSummary(qualified),
  }
}

function detailsEvidence(knownSessions) {
  return evidenceFocusGeneration(knownSessions, { minCount: MIN_SESSIONS, isUsable: isDetailsUsable })
}

export const DETAILS_HEADLINE_WINDOW_DAYS = 30

/**
 * The hero line above "Focus by session". The average is measurement-time
 * weighted over the plotted current-generation sessions, the same rule the
 * Overview uses, so the two views never show competing numbers. The delta is
 * a claim about change, so it is held back until both 30-day windows carry the
 * full MIN_SESSIONS evidence floor on one measurement generation.
 */
export function buildDetailsHeadline(sessions = [], now = Date.now()) {
  const known = knownMeasurementSessions(sessions)
  const evidence = detailsEvidence(known)
  const qualified = known
    .filter(session => session.attentionScoringVersion === evidence.generation)
    .filter(isDetailsUsable)
  const windowMs = DETAILS_HEADLINE_WINDOW_DAYS * 86400000
  const recent = qualified.filter(session => session.timestamp > now - windowMs && session.timestamp <= now)
  const previous = qualified.filter(session => session.timestamp > now - 2 * windowMs && session.timestamp <= now - windowMs)
  const recentAverage = recent.length >= MIN_SESSIONS ? aggregateAverageFocus(recent) : null
  const previousAverage = previous.length >= MIN_SESSIONS ? aggregateAverageFocus(previous) : null
  return {
    averageAttention: qualified.length ? aggregateAverageFocus(qualified) : null,
    sessionCount: qualified.length,
    onCurrentMethod: known.length === 0 || evidence.isActive,
    delta: recentAverage != null && previousAverage != null ? recentAverage - previousAverage : null,
    windowDays: DETAILS_HEADLINE_WINDOW_DAYS,
    recentCount: recent.length,
    previousCount: previous.length,
  }
}
