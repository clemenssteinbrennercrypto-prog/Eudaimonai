// Weekly review (AGENTS.md §11): a week against the week before, the best
// day, stability, and any records set — plus the rule for the one
// notification a week that brings the user back to it.
//
// Weeks run Monday–Sunday like the Lab's Weekly view. A running week is still
// filling up, so cumulative values (score, Deep Focus) are shown beside the
// previous week, never subtracted from it; averages and rates compare at any
// time. Two weeks on different camera generations are not compared at all.
import { getFocusPeriodWindow, localDayKey } from './focusMetric'
import { buildVersionedFocusPeriod } from './focusMetricV2'
import { FOCUS_SCORE } from './focusScore'
import { buildPeriodTimeSummary } from './dashboardData'
import { activeFocusGeneration, focusGenerationOf } from './historyTrend'
import { buildPersonalRecords, isQualifyingSession } from './personalRecords'
import { deriveSessionMeasures } from './sessionMeasures'
import { sessionStartedAt } from './sessionTiming'
import { formatDurationCompact } from './durationFormat'

/** The notification is a Monday-morning summary, not a late surprise: it is
 *  only sent from 08:00 on the first three days of the new week. */
const NOTIFY_FROM_HOUR = 8
const NOTIFY_WITHIN_MS = 3 * 24 * 60 * 60 * 1000

/** Lapse rates need enough measured time in the week to mean anything. */
const MIN_MEASURED_SECONDS_FOR_LAPSE_RATE = 30 * 60

function weekWindow(reference) {
  return getFocusPeriodWindow('week', 0, new Date(reference))
}

function sessionsIn(sessions, start, endExclusive) {
  const from = start.getTime()
  const to = endExclusive.getTime()
  return sessions.filter(session => {
    const startedAt = sessionStartedAt(session)
    return Number.isFinite(startedAt) && startedAt >= from && startedAt < to
  })
}

function lapseRate(sessions, generation) {
  let lapses = 0
  let measuredSeconds = 0
  for (const session of sessions) {
    if (!isQualifyingSession(session, generation)) continue
    const measures = deriveSessionMeasures(session)
    if (!measures.lapses) continue
    lapses += measures.lapses.count
    measuredSeconds += measures.measuredSeconds
  }
  if (measuredSeconds < MIN_MEASURED_SECONDS_FOR_LAPSE_RATE) return null
  return Math.round((lapses / (measuredSeconds / 3600)) * 10) / 10
}

function weekFacts({ ledger, sessions, start, endExclusive, now, generation }) {
  const period = buildVersionedFocusPeriod(ledger, {
    range: 'week',
    periodStart: start.getTime(),
    now,
    sessions,
    metricVersion: FOCUS_SCORE.metricVersion,
  })
  const time = buildPeriodTimeSummary(sessions, period, now)
  const inWeek = sessionsIn(sessions, start, endExclusive)
  const onGeneration = period?.generation === generation
  const bestDay = onGeneration
    ? (period?.days || [])
      .filter(day => Number.isFinite(day.score) && day.score > 0)
      .reduce((top, day) => (!top || day.rawScore > top.rawScore ? day : top), null)
    : null
  return {
    onGeneration,
    sessionCount: inWeek.length,
    earlierMethodSessions: inWeek.filter(session => focusGenerationOf(session) !== generation).length,
    qualifyingCount: inWeek.filter(session => isQualifyingSession(session, generation)).length,
    score: onGeneration ? period?.score ?? null : null,
    deepFocusSeconds: onGeneration ? time.deepFocusSeconds : null,
    averageAttention: onGeneration && Number.isFinite(period?.averageAttention) ? period.averageAttention : null,
    lapsesPerHour: lapseRate(inWeek, generation),
    bestDay: bestDay ? { dayKey: bestDay.key, score: bestDay.score } : null,
  }
}

/**
 * The review of the week containing `weekStart` (any moment in that week).
 * `previous` is null when the week before has no qualifying session or was
 * measured on another camera generation.
 */
export function buildWeekReview({ ledger, sessions = [], weekStart, now = Date.now() }) {
  const all = (Array.isArray(sessions) ? sessions : []).filter(Boolean)
  const generation = activeFocusGeneration(all)
  const { start, endExclusive } = weekWindow(weekStart ?? now)
  const previousWindow = getFocusPeriodWindow('week', -1, start)
  const current = weekFacts({ ledger, sessions: all, start, endExclusive, now, generation })
  const before = weekFacts({ ledger, sessions: all, start: previousWindow.start, endExclusive: previousWindow.endExclusive, now, generation })
  const startKey = localDayKey(start)
  const endKey = localDayKey(new Date(endExclusive.getTime() - 1))
  const standing = buildPersonalRecords(all, { now })
  const recordsThisWeek = standing.records
    ? Object.entries(standing.records)
      .filter(([, record]) => record?.dayKey && record.dayKey >= startKey && record.dayKey <= endKey)
      .map(([key, record]) => ({ key, ...record }))
    : []
  const previous = before.qualifyingCount > 0 && before.onGeneration && current.onGeneration ? before : null
  return {
    weekKey: startKey,
    start,
    endExclusive,
    isCurrent: now >= start.getTime() && now < endExclusive.getTime(),
    current,
    previous,
    // Last week was measured with another method: the comparison is withheld,
    // and the review says so instead of going blank.
    previousOnEarlierMethod: previous == null && before.earlierMethodSessions > 0,
    recordsThisWeek,
  }
}

/** The week that finished most recently before `now`. */
export function lastCompletedWeekStart(now = Date.now()) {
  return getFocusPeriodWindow('week', -1, new Date(now)).start
}

/**
 * The notification for last week's review, or null. It is due once per week,
 * only when last week had a qualifying session, from 08:00 on Monday to the
 * end of Wednesday, and never while a session runs (the caller passes
 * `sessionRunning`).
 */
export function dueWeekReviewNotification({ ledger, sessions = [], now = Date.now(), lastNotifiedWeekKey = null, sessionRunning = false }) {
  if (sessionRunning) return null
  const current = new Date(now)
  const thisWeekStart = getFocusPeriodWindow('week', 0, current).start
  if (current.getHours() < NOTIFY_FROM_HOUR || now - thisWeekStart.getTime() >= NOTIFY_WITHIN_MS) return null
  const weekStart = lastCompletedWeekStart(now)
  const review = buildWeekReview({ ledger, sessions, weekStart, now })
  if (review.weekKey === lastNotifiedWeekKey) return null
  if (review.current.qualifyingCount === 0) return null
  return { weekKey: review.weekKey, title: 'Your week in review', body: weekSummaryLine(review) }
}

/** One factual line for the notification: Deep Focus, against the week before
 *  when there is one. */
export function weekSummaryLine(review) {
  const deep = review.current.deepFocusSeconds
  if (!Number.isFinite(deep)) return `${review.current.sessionCount} measured ${review.current.sessionCount === 1 ? 'session' : 'sessions'} last week.`
  const previous = review.previous?.deepFocusSeconds
  const minute = value => Math.round(value / 60) * 60
  const head = `${formatDurationCompact(minute(deep))} of Deep Focus`
  if (!Number.isFinite(previous)) return `${head} last week.`
  const delta = minute(deep) - minute(previous)
  if (delta === 0) return `${head}, the same as the week before.`
  return `${head}, ${delta > 0 ? '+' : '−'}${formatDurationCompact(Math.abs(delta))} vs the week before.`
}
