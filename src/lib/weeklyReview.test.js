import { describe, expect, it } from 'vitest'
import { addSessionToFocusLedger, emptyFocusLedger, withSessionFocusMetric } from './focusMetric'
import { buildWeekReview, dueWeekReviewNotification, weekSummaryLine } from './weeklyReview'

// Real-pipeline sessions (as App saves them). Nov 2026: Mon 2, Mon 9, Mon 16.
let counter = 0
function session(day, { hour = 9, flowMinutes = 20, attention = 70, version = 2 } = {}) {
  counter += 1
  const startedAt = new Date(2026, 10, day, hour).getTime()
  const measuredSeconds = 3600
  return withSessionFocusMetric({
    id: `w${counter}`, startedAt, timestamp: startedAt + 3720e3, endedAt: startedAt + 3720e3,
    actualSeconds: 3720, measuredSeconds, scoreSum: measuredSeconds * attention, focusedSeconds: measuredSeconds,
    avgFocusScore: attention, finalScore: attention, attentionScoringVersion: version,
    deepFocusTimeVersion: 2, flowSeconds: flowMinutes * 60, focusPhases: { seconds: { lock_in: measuredSeconds } },
    timeline: [{ second: 5, score: attention }],
  })
}
const ledgerOf = sessions => sessions.reduce((ledger, item) => addSessionToFocusLedger(ledger, item), emptyFocusLedger())

describe('buildWeekReview', () => {
  const sessions = [
    session(3, { flowMinutes: 30, attention: 66 }), session(5, { flowMinutes: 30, attention: 66 }), // week of Nov 2
    session(10, { flowMinutes: 40, attention: 72 }), session(12, { flowMinutes: 50, attention: 72 }), // week of Nov 9
  ]
  const ledger = ledgerOf(sessions)

  it('sets a finished week against the week before', () => {
    const review = buildWeekReview({ ledger, sessions, weekStart: new Date(2026, 10, 9).getTime(), now: new Date(2026, 10, 18).getTime() })
    expect(review.weekKey).toBe('2026-11-09')
    expect(review.isCurrent).toBe(false)
    expect(review.current.deepFocusSeconds).toBe(90 * 60)
    expect(review.previous.deepFocusSeconds).toBe(60 * 60)
    expect(review.current.averageAttention).toBe(72)
    expect(review.current.bestDay.dayKey).toBe('2026-11-12')
  })

  it('has no previous week to compare with when that week was empty', () => {
    const review = buildWeekReview({ ledger, sessions, weekStart: new Date(2026, 10, 2).getTime(), now: new Date(2026, 10, 18).getTime() })
    expect(review.previous).toBeNull()
  })

  it('does not compare a week on another camera generation', () => {
    const mixed = [session(3, { version: 1 }), session(10)]
    const review = buildWeekReview({ ledger: ledgerOf(mixed), sessions: mixed, weekStart: new Date(2026, 10, 9).getTime(), now: new Date(2026, 10, 18).getTime() })
    expect(review.previous).toBeNull()
  })

  it('summarises Deep Focus against the week before in one line', () => {
    const review = buildWeekReview({ ledger, sessions, weekStart: new Date(2026, 10, 9).getTime(), now: new Date(2026, 10, 18).getTime() })
    expect(weekSummaryLine(review)).toBe('1h 30m of Deep Focus, +30m vs the week before.')
  })
})

describe('dueWeekReviewNotification', () => {
  const sessions = [session(10), session(12)]
  const ledger = ledgerOf(sessions)
  const monday = hour => new Date(2026, 10, 16, hour).getTime()

  it('is due on Monday morning for a week with a measured session', () => {
    const due = dueWeekReviewNotification({ ledger, sessions, now: monday(9) })
    expect(due).toMatchObject({ weekKey: '2026-11-09', title: 'Your week in review' })
  })

  it('is sent once per week', () => {
    expect(dueWeekReviewNotification({ ledger, sessions, now: monday(9), lastNotifiedWeekKey: '2026-11-09' })).toBeNull()
  })

  it('never fires during a session, before 08:00, or after Wednesday', () => {
    expect(dueWeekReviewNotification({ ledger, sessions, now: monday(9), sessionRunning: true })).toBeNull()
    expect(dueWeekReviewNotification({ ledger, sessions, now: monday(7) })).toBeNull()
    expect(dueWeekReviewNotification({ ledger, sessions, now: new Date(2026, 10, 19, 10).getTime() })).toBeNull()
  })

  it('stays quiet after a week without measured sessions', () => {
    expect(dueWeekReviewNotification({ ledger, sessions, now: new Date(2026, 10, 23, 9).getTime() })).toBeNull()
  })
})
