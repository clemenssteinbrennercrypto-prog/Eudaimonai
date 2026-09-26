import {
  isUsable,
  MIN_MEANINGFUL_GAP_PCT,
  MIN_PER_BUCKET,
  MIN_SESSIONS,
} from './calibration'
import {
  aggregateAverageFocus,
  aggregateDeepFocusTime,
  aggregateFocusMeasurements,
  sessionAverageFocus,
} from './historyTrend'
import { SCOREABLE_SCORING_VERSIONS } from './focusMetric'
import { sessionStartedAt } from './sessionTiming'

export const COHORT_SIZE = 8

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
 * display/migration; cohort claims are stricter because they compare days.
 */
export function knownComparableSessions(sessions = []) {
  const known = (Array.isArray(sessions) ? sessions : [])
    .filter(session => SCOREABLE_SCORING_VERSIONS.includes(session?.attentionScoringVersion))
  if (known.length === 0) return []

  const newest = [...known].sort((a, b) => timestampOf(b) - timestampOf(a))[0]
  return known
    .filter(session => session.attentionScoringVersion === newest.attentionScoringVersion)
    .sort((a, b) => timestampOf(b) - timestampOf(a))
}

function cohortStats(sessions) {
  const outcomes = { yes: 0, partly: 0, no: 0, unrated: 0 }
  for (const session of sessions) outcomes[normalizedOutcome(session) || 'unrated'] += 1
  const ratedCount = outcomes.yes + outcomes.partly + outcomes.no
  const measurement = aggregateFocusMeasurements(sessions)
  const deepFocus = aggregateDeepFocusTime(sessions)
  return {
    sessionCount: sessions.length,
    measuredCount: measurement.sessionCount,
    ratedCount,
    outcomes,
    hitRate: ratedCount >= 3 ? Math.round((outcomes.yes / ratedCount) * 100) : null,
    averageFocus: aggregateAverageFocus(sessions),
    deepFocusSeconds: deepFocus.seconds,
    deepFocusTrackedSessions: deepFocus.trackedSessions,
    measuredSeconds: measurement.measuredSeconds,
    focusedSeconds: measurement.focusedSeconds,
  }
}

export function buildCohortProgress(sessions = []) {
  const comparable = knownComparableSessions(sessions).filter(isUsable)
  const currentSessions = comparable.slice(0, COHORT_SIZE)
  const previousSessions = comparable.slice(COHORT_SIZE, COHORT_SIZE * 2)
  const current = cohortStats(currentSessions)
  const previous = cohortStats(previousSessions)
  const comparisonReady = currentSessions.length === COHORT_SIZE && previousSessions.length === COHORT_SIZE

  return {
    generation: comparable[0]?.attentionScoringVersion ?? null,
    qualifiedCount: comparable.length,
    current,
    previous,
    comparisonReady,
    focusDelta: comparisonReady && current.averageFocus != null && previous.averageFocus != null
      ? current.averageFocus - previous.averageFocus
      : null,
    deepFocusDeltaSeconds: comparisonReady && current.deepFocusSeconds != null && previous.deepFocusSeconds != null
      ? current.deepFocusSeconds - previous.deepFocusSeconds
      : null,
    outcomeDelta: comparisonReady && current.hitRate != null && previous.hitRate != null
      ? current.hitRate - previous.hitRate
      : null,
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
  const comparable = knownComparableSessions(safe)
  const usable = comparable.filter(isUsable)
  return {
    unratedSessions: [...safe]
      .filter(session => !normalizedOutcome(session))
      .sort((a, b) => timestampOf(b) - timestampOf(a)),
    progress: buildCohortProgress(safe),
    interventions: buildInterventionSummary(safe),
    learning: {
      qualified: usable.length,
      requiredForPatterns: 8,
      requiredForComparison: COHORT_SIZE * 2,
      generation: comparable[0]?.attentionScoringVersion ?? null,
    },
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
 * averages are produced; missing versions remain refused.
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

  return knownComparableSessions(sessions).filter(session => {
    if (cutoff && (!Number.isFinite(session.timestamp) || session.timestamp < cutoff)) return false
    if (outcome !== 'all' && (normalizedOutcome(session) || 'unrated') !== outcome) return false
    if (workspace !== 'all' && session.workspace?.id !== workspace) return false
    return true
  })
}

function conditionRows(sessions, keyFor, order = null) {
  const buckets = new Map()
  for (const session of sessions) {
    if (!isUsable(session)) continue
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
      revision: bucket.revision,
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
    rows: PHASE_ORDER
      .filter(phase => seconds[phase] > 0)
      .map(phase => ({
        id: phase,
        seconds: seconds[phase],
        sharePct: totalSeconds ? Math.round((seconds[phase] / totalSeconds) * 100) : 0,
      })),
  }
}

/**
 * The single view-model for Analytics → Details. It contains facts that can be
 * shown immediately and explicit qualification states for cross-session
 * claims. It deliberately has no activity, intervention, energy, planned-time,
 * output, or score-component inference.
 */
export function buildDetailsSummary(sessions = []) {
  const comparable = knownComparableSessions(sessions)
  const qualified = comparable.filter(isUsable)
  const distribution = buildFocusDistribution(qualified)
  const outcomes = { yes: 0, partly: 0, no: 0, unrated: 0 }
  for (const session of comparable) outcomes[normalizedOutcome(session) || 'unrated'] += 1

  const timeline = [...comparable].reverse().map(session => ({
    id: session.id,
    timestamp: sessionStartedAt(session) ?? session.timestamp,
    averageAttention: sessionAverageFocus(session),
    outcome: normalizedOutcome(session),
    durationMinutes: Number.isFinite(session.actualSeconds) && session.actualSeconds > 0
      ? Math.round(session.actualSeconds / 60)
      : null,
    workspace: session.workspace?.name || null,
    qualified: isUsable(session),
    trackingFaulted: session.trackingFaulted === true,
  }))
  const measured = timeline.filter(row => row.averageAttention != null)
  const qualifiedMeasured = measured.filter(row => row.qualified)
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
  const workspaceRows = conditionRows(comparable, session => session.workspace?.id
    ? {
        id: `${session.workspace.id}:${session.workspace.revision ?? 0}`,
        label: session.workspace.name || session.workspace.id,
        revision: session.workspace.revision ?? 0,
      }
    : null)

  return {
    generation: comparable[0]?.attentionScoringVersion ?? null,
    sessionCount: comparable.length,
    measuredCount: measured.length,
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
    duration: qualifiedMeasured.filter(row => row.durationMinutes != null),
    phases: phaseSummary(comparable),
  }
}
