import { describe, expect, it } from 'vitest'
import { addSessionToFocusLedger, emptyFocusLedger, withSessionFocusMetric } from './focusMetric'
import { buildDayBaseline, buildDayBaselineProgress } from './personalBaseline'

// Real pipeline fixtures: the session goes through withSessionFocusMetric and
// into the ledger exactly as App does after a session ends.
function session(id, day, { minutes = 60, attention = 70, flowMinutes = 20, version = 2 } = {}) {
  const startedAt = new Date(2026, 9, day, 9).getTime()
  const measuredSeconds = minutes * 60
  return withSessionFocusMetric({
    id,
    startedAt,
    timestamp: startedAt + (measuredSeconds + 120) * 1000,
    endedAt: startedAt + (measuredSeconds + 120) * 1000,
    actualSeconds: measuredSeconds + 120,
    measuredSeconds,
    scoreSum: measuredSeconds * attention,
    focusedSeconds: measuredSeconds,
    avgFocusScore: attention,
    finalScore: attention,
    attentionScoringVersion: version,
    deepFocusTimeVersion: 2,
    flowSeconds: flowMinutes * 60,
    focusPhases: { seconds: { lock_in: measuredSeconds } },
    timeline: [{ second: 5, score: attention }],
  })
}

function history(sessions) {
  return {
    sessions,
    ledger: sessions.reduce((ledger, item) => addSessionToFocusLedger(ledger, item), emptyFocusLedger()),
  }
}

const DAY_20 = new Date(2026, 9, 20).getTime()
const NOW = new Date(2026, 9, 20, 18).getTime()

describe('buildDayBaseline', () => {
  it('stays silent until five scored days exist before the selected day', () => {
    const { sessions, ledger } = history([1, 2, 3, 4].map(day => session(`s${day}`, 10 + day)))
    expect(buildDayBaseline({ ledger, sessions, dayStart: DAY_20, now: NOW })).toBeNull()
  })

  it('takes the median of scored days and leaves rest days out', () => {
    // Five working days with 10–50 min of Deep Focus; the empty days between
    // them must not drag the usual towards zero.
    const { sessions, ledger } = history([
      session('a', 11, { flowMinutes: 10, attention: 60 }),
      session('b', 13, { flowMinutes: 20, attention: 65 }),
      session('c', 15, { flowMinutes: 30, attention: 70 }),
      session('d', 17, { flowMinutes: 40, attention: 75 }),
      session('e', 19, { flowMinutes: 50, attention: 80 }),
    ])
    const baseline = buildDayBaseline({ ledger, sessions, dayStart: DAY_20, now: NOW })
    expect(baseline.days).toBe(5)
    expect(baseline.deepFocusSeconds).toBe(30 * 60)
    expect(baseline.averageAttention).toBe(70)
    expect(baseline.focusScore).toBeGreaterThan(0)
  })

  it('never counts the selected day itself or days after it', () => {
    const days = [11, 12, 13, 14, 15].map(day => session(`p${day}`, day, { flowMinutes: 20 }))
    const { sessions, ledger } = history([...days, session('today', 20, { flowMinutes: 200 }), session('later', 21, { flowMinutes: 200 })])
    expect(buildDayBaseline({ ledger, sessions, dayStart: DAY_20, now: new Date(2026, 9, 22).getTime() }).deepFocusSeconds).toBe(20 * 60)
  })

  it('looks back 28 days and no further', () => {
    const old = [1, 2, 3].map(day => session(`old${day}`, day))
    const recent = [18, 19].map(day => session(`new${day}`, day))
    const { sessions, ledger } = history([...old, ...recent])
    // Oct 1–3 are within 28 days of Oct 20, so five days qualify.
    expect(buildDayBaseline({ ledger, sessions, dayStart: DAY_20, now: NOW })?.days).toBe(5)
    // From Oct 31, Oct 1–2 fall outside the window.
    expect(buildDayBaseline({ ledger, sessions, dayStart: new Date(2026, 9, 31).getTime(), now: new Date(2026, 9, 31, 18).getTime() })).toBeNull()
  })

  it('ignores days measured on another camera generation', () => {
    const { sessions, ledger } = history([
      ...[11, 12, 13, 14].map(day => session(`v2-${day}`, day)),
      session('v1', 15, { version: 1 }),
    ])
    expect(buildDayBaseline({ ledger, sessions, dayStart: DAY_20, now: NOW })).toBeNull()
  })
})

describe('buildDayBaselineProgress', () => {
  // After a scoring change the usual goes silent; the Lab must be able to say
  // why instead of the comparison simply vanishing.
  it('counts scored days on an earlier method without comparing them', () => {
    const { sessions, ledger } = history([
      ...[11, 12, 13, 14, 15, 16].map(day => session(`old${day}`, day)),
      session('new', 19, { version: 5 }),
    ])
    expect(buildDayBaseline({ ledger, sessions, dayStart: DAY_20, now: NOW })).toBeNull()
    expect(buildDayBaselineProgress({ ledger, sessions, dayStart: DAY_20, now: NOW }))
      .toEqual({ days: 1, required: 5, earlierMethodDays: 6 })
  })

  it('reports no earlier-method days when the usual is simply still collecting', () => {
    const { sessions, ledger } = history([1, 2].map(day => session(`s${day}`, 10 + day)))
    expect(buildDayBaselineProgress({ ledger, sessions, dayStart: DAY_20, now: NOW }))
      .toEqual({ days: 2, required: 5, earlierMethodDays: 0 })
  })
})

