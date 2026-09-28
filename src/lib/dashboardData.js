import { FOCUSED_SCORE, GOOD_STREAK_SCORE } from './attention'
import { FOCUS_METRIC_V1, SCOREABLE_SCORING_VERSIONS, getFocusPeriodWindow } from './focusMetric'
import { buildVersionedFocusPeriod } from './focusMetricV2'
import { FOCUS_SCORE } from './focusScore'
import { activeFocusGeneration, focusGenerationOf } from './historyTrend'
import { DEEP_FOCUS_TIME_VERSION } from './attentionSampling'
import { sessionEndedAt, sessionPauseIntervals, sessionStartedAt, timelineWallSecond } from './sessionTiming'
import { getProtectionReadiness } from './protectionReadiness'

export function buildAttentionField(sessions, { range = 'day', offset = 0, periodStart = null, now = Date.now(), bins = 96 } = {}) {
  const safeRange = ['day', 'week', 'month'].includes(range) ? range : 'day'
  const safeNow = new Date(now)
  const windowNow = Number.isNaN(safeNow.getTime()) ? new Date() : safeNow
  const nowMs = windowNow.getTime()
  const requestedStart = new Date(periodStart)
  const hasExplicitStart = periodStart != null && !Number.isNaN(requestedStart.getTime())
  const periodWindow = getFocusPeriodWindow(
    safeRange,
    hasExplicitStart ? 0 : offset,
    hasExplicitStart ? requestedStart : windowNow
  )
  const start = periodWindow.start.getTime()
  const endExclusive = periodWindow.endExclusive.getTime()
  const width = Math.max(1, endExclusive - start)
  const measurementEnd = Math.min(nowMs, endExclusive)
  const safeBins = Math.max(12, Math.min(160, Math.trunc(bins) || 96))
  const buckets = Array.from({ length: safeBins }, () => ({
    scores: [],
    sessions: new Map(),
    active: false,
    paused: false,
  }))
  const scoreableSessions = (Array.isArray(sessions) ? sessions : []).filter(session =>
    SCOREABLE_SCORING_VERSIONS.includes(session?.attentionScoringVersion) &&
    new Date(session.timestamp ?? session.startedAt) <= windowNow)
  const activeGeneration = activeFocusGeneration(scoreableSessions)

  for (const session of scoreableSessions) {
    // The field is a comparison just like Trends and Patterns: show the ruler
    // in current use, but never average coordinates measured by two different
    // camera generations into one colour cell.
    if (focusGenerationOf(session) !== activeGeneration) continue
    const sessionStartMs = sessionStartedAt(session)
    if (!Number.isFinite(sessionStartMs)) continue
    const sessionEndMs = sessionEndedAt(session)
    if (!Number.isFinite(sessionEndMs) || sessionEndMs < sessionStartMs) continue
    if (sessionEndMs <= start || sessionStartMs >= measurementEnd) continue

    const firstBin = Math.max(0, Math.floor(((sessionStartMs - start) / width) * safeBins))
    const lastBin = Math.min(safeBins - 1, Math.floor(((sessionEndMs - start) / width) * safeBins))
    const sessionName = String(session?.task || '').trim() || 'Untitled session'
    const sessionKey = `${session?.id || sessionName}\u0000${sessionStartMs}\u0000${sessionEndMs}`
    for (let i = firstBin; i <= lastBin; i++) {
      buckets[i].active = true
      const binStart = start + (i / safeBins) * width
      const binEnd = start + ((i + 1) / safeBins) * width
      const overlapMs = Math.max(0, Math.min(sessionEndMs, binEnd) - Math.max(sessionStartMs, binStart))
      if (overlapMs > 0) {
        const current = buckets[i].sessions.get(sessionKey) || {
          name: sessionName,
          startedAt: sessionStartMs,
          endedAt: sessionEndMs,
          overlapMs: 0,
        }
        buckets[i].sessions.set(sessionKey, { ...current, overlapMs: current.overlapMs + overlapMs })
      }
    }

    for (const pause of sessionPauseIntervals(session)) {
      for (let i = firstBin; i <= lastBin; i++) {
        const binStart = start + (i / safeBins) * width
        const binEnd = start + ((i + 1) / safeBins) * width
        if (pause.startedAt < binEnd && pause.endedAt > binStart) buckets[i].paused = true
      }
    }

    for (const point of session.timeline || []) {
      if (!Number.isFinite(point?.second) || !Number.isFinite(point?.score)) continue
      const pointTime = sessionStartMs + timelineWallSecond(point) * 1000
      if (pointTime < start || pointTime >= measurementEnd) continue
      const index = Math.min(safeBins - 1, Math.max(0, Math.floor(((pointTime - start) / width) * safeBins)))
      buckets[index].scores.push(point.score)
    }
  }

  return buckets.map((bucket, index) => {
    const bucketStart = start + (index / safeBins) * width
    const session = [...bucket.sessions.values()]
      .sort((a, b) => b.overlapMs - a.overlapMs || a.startedAt - b.startedAt || a.name.localeCompare(b.name))[0] || null
    const sessionDetails = session
      ? { sessionName: session.name, sessionStartedAt: session.startedAt, sessionEndedAt: session.endedAt }
      : { sessionName: null, sessionStartedAt: null, sessionEndedAt: null }
    if (bucketStart >= nowMs) {
      return { index, timestamp: bucketStart, state: 'future', score: null, sessionName: null, sessionStartedAt: null, sessionEndedAt: null }
    }
    if (bucket.scores.length === 0) {
      return {
        index,
        timestamp: bucketStart,
        state: bucket.paused ? 'paused' : bucket.active ? 'no-signal' : 'inactive',
        score: null,
        ...sessionDetails,
      }
    }
    const score = Math.round(bucket.scores.reduce((sum, value) => sum + value, 0) / bucket.scores.length)
    // Same bands as every other attention view (attentionTimelineBand):
    // high from GOOD_STREAK_SCORE, focused from FOCUSED_SCORE, low below.
    // The Lab used the flow threshold (72) here, so one score could read
    // "high" in a session and merely "focused" in the Lab.
    const state = score >= GOOD_STREAK_SCORE ? 'strong' : score >= FOCUSED_SCORE ? 'focused' : 'drift'
    return { index, timestamp: bucketStart, state, score, ...sessionDetails }
  })
}

function outcomeLabel(session) {
  if (session?.goalOutcome === 'yes' || session?.goalAchieved === true) return 'Done'
  if (session?.goalOutcome === 'partly') return 'Partial'
  if (session?.goalOutcome === 'no' || session?.goalAchieved === false) return 'Missed'
  return 'Unset'
}

export function buildPeriodTimeSummary(sessions, period, now = Date.now()) {
  const start = period?.start instanceof Date ? period.start.getTime() : Number.NaN
  const end = period?.endExclusive instanceof Date ? period.endExclusive.getTime() : Number.NaN
  const nowMs = new Date(now).getTime()
  const selected = (Array.isArray(sessions) ? sessions : []).filter(session => {
    const startedAt = sessionStartedAt(session)
    // Focus Time is a clock, not a derived camera ruler. Keep every session in
    // the selected calendar period even when the current Focus Score starts
    // later or excludes a different measurement generation.
    return Number.isFinite(startedAt) && startedAt >= start &&
      startedAt < end && startedAt <= nowMs
  })
  const validDuration = selected.filter(session => Number.isFinite(session?.actualSeconds) && session.actualSeconds >= 0)
  const focusSeconds = validDuration.length > 0
    ? validDuration.reduce((sum, session) => sum + session.actualSeconds, 0)
    : null
  const coverageKnown = validDuration.length > 0 && validDuration.length === selected.length && validDuration.every(session =>
    Number.isFinite(session?.measuredSeconds) && session.measuredSeconds >= 0 && session.measuredSeconds <= session.actualSeconds + 1)
  const measuredSeconds = coverageKnown
    ? validDuration.reduce((sum, session) => sum + session.measuredSeconds, 0)
    : null
  const measurementCoverage = focusSeconds > 0 && measuredSeconds != null
    ? Math.min(1, measuredSeconds / focusSeconds)
    : null
  const deepFocusComplete = validDuration.length > 0 && validDuration.length === selected.length && validDuration.every(session =>
    session?.deepFocusTimeVersion === DEEP_FOCUS_TIME_VERSION &&
    Number.isFinite(session?.flowSeconds) && session.flowSeconds >= 0 &&
    Number.isFinite(session?.measuredSeconds) && session.flowSeconds <= session.measuredSeconds)

  return {
    sessionCount: selected.length,
    focusSeconds,
    deepFocusSeconds: deepFocusComplete
      ? validDuration.reduce((sum, session) => sum + session.flowSeconds, 0)
      : null,
    deepFocusComplete,
    measuredSeconds,
    measurementCoverage,
    measurementWarning: measurementCoverage != null && measurementCoverage < 0.9,
    measurementCoverageUnknown: focusSeconds > 0 && measuredSeconds == null,
  }
}

export function buildDashboardData({ ledger, sessions, focusConfig, focusModeEnabled, nativeStatus, range = 'day', offset = 0, periodStart = null, now = Date.now(), metricVersion = FOCUS_SCORE.metricVersion, schedule }) {
  const period = buildVersionedFocusPeriod(ledger, {
    range: ['day', 'week', 'month'].includes(range) ? range : 'day',
    offset,
    periodStart,
    now,
    sessions,
    metricVersion,
    schedule,
  })
  const readiness = getProtectionReadiness({ enabled: focusModeEnabled, setup: focusConfig, nativeStatus })
  const { distractionCount, websiteCount } = readiness
  const protection = ({
    off: { state: 'off', label: 'Off', detail: 'Focus mode disabled' },
    empty: { state: 'empty', label: 'Not configured', detail: 'Choose apps and websites' },
    checking: { state: 'checking', label: 'Checking', detail: 'Verifying native protection' },
    disconnected: { state: 'disconnected', label: 'Not connected', detail: 'Native protection is unavailable' },
    permission: { state: 'permission', label: 'Permission required', detail: `Allow Automation access for ${readiness.permissionMissing}` },
    helper: { state: 'helper', label: 'Setup required', detail: 'Install the website blocking helper' },
    ready: {
      state: 'ready',
      label: 'Ready',
      detail: `${readiness.strictMode ? 'Strict · ' : ''}${distractionCount} ${distractionCount === 1 ? 'distraction' : 'distractions'} · ${websiteCount} ${websiteCount === 1 ? 'website' : 'websites'}`,
    },
  })[readiness.state]

  const recentSessions = (sessions || []).slice(0, 3).map(session => ({
    id: session.id,
    task: session.task || 'Untitled session',
    durationSeconds: Math.max(0, Number(session.actualSeconds) || 0),
    efficiency: session?.focusMetricVersion === FOCUS_METRIC_V1.version &&
      session?.focusMetricRejection == null && Number.isFinite(session?.sessionEfficiency) &&
      session.sessionEfficiency >= 0 && session.sessionEfficiency <= 100
      ? session.sessionEfficiency
      : null,
    outcome: outcomeLabel(session),
  }))

  return {
    period,
    time: buildPeriodTimeSummary(sessions, period, now),
    attention: buildAttentionField(sessions, { range, offset, periodStart, now }),
    protection,
    recentSessions,
  }
}
