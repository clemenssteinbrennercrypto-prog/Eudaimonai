import { describe, expect, it } from 'vitest'
import { withSessionFocusMetric } from './focusMetric'
import { buildPersonalRecords, newRecordsForSession, RECORDS_MIN_SESSIONS } from './personalRecords'

const NOW = new Date(2026, 10, 30, 20).getTime()

// A real-pipeline session: `blockMinutes` of unbroken Deep Focus samples in a
// one-hour session, with the exact total Deep Focus to match.
let counter = 0
function session({ day, hour = 9, blockMinutes = 20, version = 2, faulted = false } = {}) {
  counter += 1
  const startedAt = new Date(2026, 10, day, hour).getTime()
  const measuredSeconds = 3600
  const blockSamples = blockMinutes * 12
  const timeline = Array.from({ length: 720 }, (_, i) => ({
    second: (i + 1) * 5,
    score: i < blockSamples ? 80 : 66,
    focused: true,
    deepFocused: i < blockSamples,
    inFlow: i < blockSamples,
  }))
  return withSessionFocusMetric({
    id: `s${counter}`,
    startedAt,
    timestamp: startedAt + 3720e3,
    endedAt: startedAt + 3720e3,
    actualSeconds: 3720,
    measuredSeconds,
    scoreSum: measuredSeconds * 70,
    focusedSeconds: measuredSeconds,
    avgFocusScore: 70,
    finalScore: 70,
    attentionScoringVersion: version,
    deepFocusTimeVersion: 2,
    flowSeconds: blockSamples * 5 + 90,
    focusPhases: { seconds: { lock_in: measuredSeconds } },
    trackingFaulted: faulted,
    timeline,
  })
}

const tenDays = () => Array.from({ length: RECORDS_MIN_SESSIONS }, (_, i) => session({ day: i + 1, blockMinutes: 10 + i }))

describe('buildPersonalRecords', () => {
  // 7 Oct 2026: three scoring generations shipped in one day, and the first
  // session on the newest one made every standing record disappear.
  it('keeps showing the earlier method\'s records until the current method has 10 sessions', () => {
    const sessions = [...tenDays(), session({ day: 20, version: 5, blockMinutes: 50 })]
    const result = buildPersonalRecords(sessions, { now: NOW })
    expect(result).toMatchObject({ ready: true, generation: 2, isCurrentMethod: false, currentMethodCount: 1, qualifyingCount: 10 })
    // Read on the earlier generation only: the 50-minute V5 block is not mixed in.
    expect(result.records.longestBlock).toMatchObject({ value: 19 * 60 + 90, dayKey: '2026-11-10' })
  })

  it('switches to the current method once it has 10 sessions of its own', () => {
    const current = Array.from({ length: RECORDS_MIN_SESSIONS }, (_, i) => session({ day: 12 + i, version: 5, blockMinutes: 5 }))
    const result = buildPersonalRecords([...tenDays(), ...current], { now: NOW })
    expect(result).toMatchObject({ ready: true, generation: 5, isCurrentMethod: true, qualifyingCount: 10 })
    expect(result.records.longestBlock.value).toBe(5 * 60 + 90)
  })

  it('never announces a record measured against an earlier method', () => {
    const fresh = session({ day: 20, version: 5, blockMinutes: 50 })
    expect(newRecordsForSession(fresh, tenDays(), { now: NOW })).toEqual([])
  })

  it('stays silent below 10 qualifying sessions', () => {
    const result = buildPersonalRecords(tenDays().slice(0, 9), { now: NOW })
    expect(result).toMatchObject({ qualifyingCount: 9, ready: false, records: null })
  })

  it('reports the three records once ready', () => {
    const { ready, records } = buildPersonalRecords(tenDays(), { now: NOW })
    expect(ready).toBe(true)
    expect(records.longestBlock).toMatchObject({ value: 19 * 60 + 90, dayKey: '2026-11-10' })
    expect(records.dayDeepFocus).toMatchObject({ value: 19 * 60 + 90, dayKey: '2026-11-10' })
    expect(records.dayScore.dayKey).toBe('2026-11-10')
  })

  it('counts neither faulted sessions nor another camera generation', () => {
    const sessions = [...tenDays().slice(0, 8), session({ day: 20, faulted: true }), session({ day: 21, version: 1 }), session({ day: 22 })]
    expect(buildPersonalRecords(sessions, { now: NOW }).qualifyingCount).toBe(9)
  })
})

describe('newRecordsForSession', () => {
  it('announces nothing until 10 qualifying sessions came before', () => {
    const prior = tenDays().slice(0, 9)
    expect(newRecordsForSession(session({ day: 15, blockMinutes: 50 }), prior, { now: NOW })).toEqual([])
  })

  it('announces a longer Deep Focus block with the previous best', () => {
    const found = newRecordsForSession(session({ day: 15, blockMinutes: 25 }), tenDays(), { now: NOW })
    expect(found.find(r => r.key === 'longestBlock')).toEqual({
      key: 'longestBlock', label: 'Longest Deep Focus block', value: 25 * 60 + 90, previous: 19 * 60 + 90,
    })
  })

  it('does not announce a session that only ties or trails the best', () => {
    expect(newRecordsForSession(session({ day: 15, blockMinutes: 19 }), tenDays(), { now: NOW })).toEqual([])
  })

  it('announces a day record only from the session that crossed it', () => {
    const prior = tenDays()
    // Two 12-minute sessions on Nov 15: each alone trails the best day (19 m),
    // together they pass it. Only the second one crossed the line.
    const first = session({ day: 15, hour: 9, blockMinutes: 12 })
    const second = session({ day: 15, hour: 14, blockMinutes: 12 })
    const third = session({ day: 15, hour: 18, blockMinutes: 12 })
    expect(newRecordsForSession(first, prior, { now: NOW }).map(r => r.key)).not.toContain('dayDeepFocus')
    expect(newRecordsForSession(second, [...prior, first], { now: NOW }).map(r => r.key)).toContain('dayDeepFocus')
    expect(newRecordsForSession(third, [...prior, first, second], { now: NOW }).map(r => r.key)).not.toContain('dayDeepFocus')
  })
})
