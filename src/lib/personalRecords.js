// Personal records (AGENTS.md §11): the user's own bests, nothing else.
//
// Records stay silent until 10 qualifying sessions exist. Before that almost
// every session beats the last one, and a "record" every day stops meaning
// anything. Only sessions on the camera generation in use now qualify, so a
// method change can never produce a record by itself.
//
// Day records are computed on a ledger rebuilt from the sessions passed in.
// That keeps the debrief independent of whether the stored ledger has caught
// up with the session that just ended, and makes "this day without this
// session" a question the same function can answer.
import { addSessionToFocusLedger, emptyFocusLedger, localDayKey } from './focusMetric'
import { buildVersionedFocusPeriod } from './focusMetricV2'
import { FOCUS_SCORE } from './focusScore'
import { activeFocusGeneration, focusGenerationOf, sessionDeepFocusSeconds, sessionFocusMeasurement } from './historyTrend'
import { deriveSessionMeasures } from './sessionMeasures'
import { sessionStartedAt } from './sessionTiming'

export const RECORDS_MIN_SESSIONS = 10
const MIN_MEASURED_SECONDS = 5 * 60

export const RECORD_LABELS = Object.freeze({
  longestBlock: 'Longest Deep Focus block',
  dayDeepFocus: 'Most Deep Focus in a day',
  dayScore: 'Best Focus Score day',
})

export function isQualifyingSession(session, generation) {
  if (!session || session.trackingFaulted) return false
  if (focusGenerationOf(session) !== generation) return false
  const measurement = sessionFocusMeasurement(session)
  return measurement != null && measurement.measuredSeconds >= MIN_MEASURED_SECONDS &&
    sessionDeepFocusSeconds(session) != null
}

function dayKeyOf(session) {
  const startedAt = sessionStartedAt(session)
  return Number.isFinite(startedAt) ? localDayKey(startedAt) : null
}

function dayStartOf(key) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}

function best(entries) {
  return entries.reduce((top, entry) => (entry.value > 0 && (!top || entry.value > top.value) ? entry : top), null)
}

function blockEntries(sessions) {
  return sessions.map(session => ({
    value: deriveSessionMeasures(session).longestDeepFocusSeconds ?? 0,
    sessionId: session.id,
    dayKey: dayKeyOf(session),
  }))
}

function dayDeepFocusEntries(sessions) {
  const days = new Map()
  for (const session of sessions) {
    const key = dayKeyOf(session)
    if (!key) continue
    days.set(key, (days.get(key) || 0) + sessionDeepFocusSeconds(session))
  }
  return [...days].map(([dayKey, value]) => ({ value, dayKey }))
}

function dayScoreEntries(sessions, now) {
  const ledger = sessions.reduce((current, session) => addSessionToFocusLedger(current, session), emptyFocusLedger())
  const keys = [...new Set(sessions.map(dayKeyOf).filter(Boolean))]
  return keys.map(dayKey => {
    const period = buildVersionedFocusPeriod(ledger, {
      range: 'day',
      periodStart: dayStartOf(dayKey),
      now,
      sessions,
      metricVersion: FOCUS_SCORE.metricVersion,
    })
    // Ranked on the unrounded score so two days that both show 41 are not a
    // tie decided by date; the shown value stays the rounded score.
    return { value: period?.rawScore ?? period?.score ?? 0, shown: period?.score ?? 0, dayKey }
  })
}

/** { qualifyingCount, ready, records } for the sessions given. Each record is
 *  { value, dayKey, sessionId? } or null when nothing positive exists yet. */
export function buildPersonalRecords(sessions = [], { now = Date.now() } = {}) {
  const all = (Array.isArray(sessions) ? sessions : []).filter(Boolean)
  const generation = activeFocusGeneration(all)
  const qualifying = all.filter(session => isQualifyingSession(session, generation))
  const ready = qualifying.length >= RECORDS_MIN_SESSIONS
  return {
    qualifyingCount: qualifying.length,
    ready,
    records: ready
      ? {
        longestBlock: best(blockEntries(qualifying)),
        dayDeepFocus: best(dayDeepFocusEntries(qualifying)),
        dayScore: best(dayScoreEntries(qualifying, now)),
      }
      : null,
  }
}

/**
 * Records the given session has just set, as [{ key, label, value, previous }].
 * Requires 10 qualifying sessions BEFORE this one. A day record is announced
 * only by the session that pushed the day past the previous best, not again
 * by every later session the same day.
 */
export function newRecordsForSession(session, priorSessions = [], { now = Date.now() } = {}) {
  const prior = (Array.isArray(priorSessions) ? priorSessions : []).filter(item => item && item.id !== session?.id)
  const generation = activeFocusGeneration([...prior, session].filter(Boolean))
  if (!isQualifyingSession(session, generation)) return []
  const before = prior.filter(item => isQualifyingSession(item, generation))
  if (before.length < RECORDS_MIN_SESSIONS) return []

  const dayKey = dayKeyOf(session)
  const sameDay = before.filter(item => dayKeyOf(item) === dayKey)
  const otherDays = before.filter(item => dayKeyOf(item) !== dayKey)
  const found = []

  const block = deriveSessionMeasures(session).longestDeepFocusSeconds
  const previousBlock = best(blockEntries(before))?.value ?? 0
  if (block != null && block > previousBlock && previousBlock > 0) {
    found.push({ key: 'longestBlock', label: RECORD_LABELS.longestBlock, value: block, previous: previousBlock })
  }

  // Compared on the value the user sees: a day score is announced only when
  // the rounded number rises, never as "41 (previous best 41)".
  const shownOf = entry => entry?.shown ?? entry?.value ?? 0
  const dayRecord = (key, entriesFor) => {
    const otherBest = shownOf(best(entriesFor(otherDays)))
    const withSession = shownOf(entriesFor([...sameDay, session]).find(entry => entry.dayKey === dayKey))
    const withoutSession = sameDay.length ? shownOf(entriesFor(sameDay).find(entry => entry.dayKey === dayKey)) : 0
    if (otherBest > 0 && withSession > otherBest && withoutSession <= otherBest) {
      found.push({ key, label: RECORD_LABELS[key], value: withSession, previous: otherBest })
    }
  }
  dayRecord('dayDeepFocus', dayDeepFocusEntries)
  dayRecord('dayScore', items => dayScoreEntries(items, now))
  return found
}
