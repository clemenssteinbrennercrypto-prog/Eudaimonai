import { describe, expect, it } from 'vitest'
import {
  FOCUS_SCORE,
  buildFocusScorePeriod,
  dayFocusCredit,
  focusCreditFromTotals,
  focusQualityFactor,
  focusScoreFromEffectiveMinutes,
} from './focusScore'
import { buildVersionedFocusPeriod } from './focusMetricV2'
import { addSessionToFocusLedger, backfillFocusLedger, emptyFocusLedger } from './focusMetric'

const at = (day, hour = 18) => new Date(2026, 8, day, hour)
const contribution = ({ minutes = 60, attention = 68, deepMinutes = 0, generation = 2, exact = true, startedAt } = {}) => {
  const measuredSeconds = minutes * 60
  return {
    version: 1,
    generation,
    measuredSeconds,
    scoreSum: measuredSeconds * attention,
    deepFocusSeconds: 0,
    ...(Number.isFinite(startedAt) ? { startedAt } : {}),
    ...(exact ? { deepFocusTimeVersion: 2, flowSeconds: deepMinutes * 60 } : {}),
  }
}
const ledgerOf = days => ({
  schemaVersion: 1,
  days: Object.fromEntries(Object.entries(days).map(([key, sessions]) => [key, { sessions }])),
})
const day = (sessions, now = at(14), extra = {}) => buildFocusScorePeriod(
  ledgerOf({ '2026-09-14': sessions }),
  { range: 'day', now, ...extra }
)
const week = (days, now = at(20), extra = {}) => buildFocusScorePeriod(ledgerOf(days), { range: 'week', now, ...extra })

describe('Focus Score quality and volume curves', () => {
  it('anchors quality to the existing alert and Flow bands', () => {
    expect(focusQualityFactor(38)).toBe(0)
    expect(focusQualityFactor(55)).toBeCloseTo(0.5)
    expect(focusQualityFactor(72)).toBe(1)
    expect(focusQualityFactor(90)).toBe(1)
    expect(focusQualityFactor(-1)).toBeNull()
  })

  it('is 0 without effective time, 50 at the reference, and bounded below 100', () => {
    expect(focusScoreFromEffectiveMinutes(0, 80)).toBe(0)
    expect(focusScoreFromEffectiveMinutes(80, 80)).toBeCloseTo(50, 10)
    expect(focusScoreFromEffectiveMinutes(100_000, 80)).toBeLessThan(100)
  })

  it('softens the first hour while visibly distinguishing four and eight hours', () => {
    expect(Math.round(focusScoreFromEffectiveMinutes(60, 80))).toBe(41)
    expect(Math.round(focusScoreFromEffectiveMinutes(120, 80))).toBe(63)
    expect(Math.round(focusScoreFromEffectiveMinutes(240, 80))).toBe(81)
    expect(Math.round(focusScoreFromEffectiveMinutes(480, 80))).toBe(91)
  })

  it('uses time as volume, attention as multiplier, and exact Deep Focus as a 25% bonus', () => {
    const plain = focusCreditFromTotals({ measuredSeconds: 3600, scoreSum: 3600 * 68, deepFocusSeconds: 0 })
    const deep = focusCreditFromTotals({ measuredSeconds: 3600, scoreSum: 3600 * 68, deepFocusSeconds: 1200 })
    expect(plain).toMatchObject({ averageAttention: 68, qualityFactor: 30 / 34 })
    expect(deep.effectiveSeconds - plain.effectiveSeconds).toBeCloseTo(1200 * 0.25 * (30 / 34))
  })

  it('matches the intended daily examples without presenting attention as a percentage grade', () => {
    const cases = [
      { minutes: 10, attention: 80, deepMinutes: 5, score: 7 },
      { minutes: 60, attention: 68, deepMinutes: 20, score: 39 },
      { minutes: 120, attention: 68, deepMinutes: 45, score: 62 },
      { minutes: 120, attention: 72, deepMinutes: 60, score: 66 },
      { minutes: 120, attention: 40, deepMinutes: 0, score: 4 },
    ]
    for (const item of cases) {
      expect(day({ work: contribution(item) }).score).toBe(item.score)
    }
  })

  it('refuses malformed raw totals', () => {
    expect(focusCreditFromTotals({ measuredSeconds: 0, scoreSum: 0, deepFocusSeconds: 0 })).toBeNull()
    expect(focusCreditFromTotals({ measuredSeconds: 60, scoreSum: 6001, deepFocusSeconds: 0 })).toBeNull()
    expect(focusCreditFromTotals({ measuredSeconds: 60, scoreSum: 3000, deepFocusSeconds: 62 })).toBeNull()
  })
})

describe('exact Deep Focus history boundary', () => {
  it('starts on the first day with version-2 exact Deep Focus and leaves older days outside the ruler', () => {
    const period = week({
      '2026-09-14': { old: contribution({ exact: false }) },
      '2026-09-15': { current: contribution({ minutes: 60, attention: 68, deepMinutes: 20 }) },
    })
    expect(period.metricStartKey).toBe('2026-09-15')
    expect(period.partialMetricPeriod).toBe(true)
    expect(period.days.slice(0, 2).map(item => item.status)).toEqual(['before_metric', 'measured'])
    expect(period.score).not.toBeNull()
  })

  it('refuses a missing exact value after the ruler has started instead of showing a partial total', () => {
    const period = week({
      '2026-09-14': { current: contribution() },
      '2026-09-15': { broken: contribution({ exact: false }) },
    }, at(15))
    expect(period).toMatchObject({ score: null, refusal: 'missing_exact_deep_focus' })
    expect(period.days[1].status).toBe('unscorable')
    expect(period.averageAttention).toBe(68)
    expect(period.measuredSeconds).toBe(7200)
  })

  it('refuses a mixed cutover day because ordering cannot be guessed from old ledger entries', () => {
    const result = day({ old: contribution({ exact: false }), current: contribution() })
    expect(result.score).toBeNull()
    expect(result.refusal).toBe('missing_exact_deep_focus')
  })

  it('separates pre-boundary work on the cutover day when genuine session starts prove the ordering', () => {
    const oldStart = at(14, 9).getTime()
    const exactStart = at(14, 10).getTime()
    const result = day({
      old: contribution({ exact: false, startedAt: oldStart }),
      current: contribution({ deepMinutes: 20, startedAt: exactStart }),
    })
    expect(result).toMatchObject({ metricStartAt: exactStart, measuredSeconds: 3600 })
    expect(result.score).not.toBeNull()
  })

  it('refuses missing exact Deep Focus after the timestamped cutover boundary', () => {
    const exactStart = at(14, 10).getTime()
    const result = day({
      current: contribution({ startedAt: exactStart }),
      broken: contribution({ exact: false, startedAt: at(14, 11).getTime() }),
    })
    expect(result).toMatchObject({ score: null, refusal: 'missing_exact_deep_focus' })
  })

  it('requires the exact version and bounds Flow time by measured time', () => {
    expect(dayFocusCredit({ sessions: { legacy: contribution({ exact: false }) } })).toMatchObject({ refused: true })
    expect(dayFocusCredit({ sessions: { invalid: { ...contribution(), flowSeconds: 3600.5 } } })).toMatchObject({ refused: true })
  })

  it('waits for the first exact Deep Focus contribution instead of calling older data pre-metric', () => {
    const result = day({ legacy: contribution({ exact: false }) })
    expect(result).toMatchObject({ metricStartKey: null, score: null })
    expect(result.today.status).toBe('awaiting_metric')
  })
})

describe('Focus Score period aggregation', () => {
  it('adds raw time and Deep Focus before applying one period quality multiplier', () => {
    const period = week({
      '2026-09-14': { strong: contribution({ minutes: 60, attention: 72, deepMinutes: 30 }) },
      '2026-09-15': { weak: contribution({ minutes: 60, attention: 55, deepMinutes: 0 }) },
    }, at(15))
    expect(period.averageAttention).toBeCloseTo(63.5)
    expect(period.qualityFactor).toBeCloseTo(25.5 / 34)
    expect(period.referenceWorkdays).toBe(2)
    expect(period.score).toBe(Math.round(focusScoreFromEffectiveMinutes(period.effectiveMinutes, 160)))
  })

  it('rewards more work when quality is held constant', () => {
    const oneHour = day({ a: contribution({ minutes: 60, attention: 68, deepMinutes: 20 }) })
    const twoHours = day({ a: contribution({ minutes: 120, attention: 68, deepMinutes: 40 }) })
    expect(twoHours.score).toBeGreaterThan(oneHour.score)
  })

  it('allows sufficiently poor added time to lower the score through average attention', () => {
    const strong = day({ a: contribution({ minutes: 60, attention: 72, deepMinutes: 20 }) })
    const padded = day({
      a: contribution({ minutes: 60, attention: 72, deepMinutes: 20 }),
      b: contribution({ minutes: 60, attention: 10, deepMinutes: 0 }),
    })
    expect(padded.averageAttention).toBe(41)
    expect(padded.score).toBeLessThan(strong.score)
  })

  it('uses elapsed weekdays as the period reference and rewards weekend work without adding a reference day', () => {
    const weekday = week({ '2026-09-14': { a: contribution() } })
    const saturday = week({
      '2026-09-14': { a: contribution() },
      '2026-09-19': { b: contribution() },
    })
    expect(weekday.referenceWorkdays).toBe(5)
    expect(saturday.referenceWorkdays).toBe(5)
    expect(saturday.score).toBeGreaterThan(weekday.score)
  })

  it('uses one reference day when the score begins on a weekend', () => {
    const period = week({
      '2026-09-19': { saturday: contribution({ minutes: 120, deepMinutes: 40 }) },
    }, at(19))
    expect(period).toMatchObject({ referenceWorkdays: 1, referenceMinutes: 80 })
    expect(period.score).not.toBeNull()
  })

  it('leaves a wholly historical pre-metric period unscored without calling its data missing', () => {
    const period = buildFocusScorePeriod(ledgerOf({
      '2026-09-14': { old: contribution({ exact: false }) },
      '2026-09-22': { current: contribution() },
    }), { range: 'week', periodStart: at(14), now: at(22) })
    expect(period).toMatchObject({ score: null, beforeMetricPeriod: true, metricStartKey: '2026-09-22' })
    expect(period.days[0].status).toBe('before_metric')
    expect(period.days[1].status).toBe('inactive')
  })

  it('ignores self-selected workday plans so the ruler cannot be gamed', () => {
    const schedule = { version: 1, plans: [{ effectiveFrom: '2026-09-17', workdays: [1, 2, 3, 4, 5, 6] }] }
    const period = week({ '2026-09-14': { a: contribution() } }, at(20), { schedule })
    expect(period.referenceWorkdays).toBe(5)
  })

  it('keeps camera generations isolated', () => {
    const period = week({
      '2026-09-14': { old: contribution({ generation: 1 }) },
      '2026-09-15': { current: contribution({ generation: 2 }) },
    }, at(15))
    expect(period.days.slice(0, 2).map(item => item.status)).toEqual(['different_generation', 'measured'])
    expect(period.measuredSeconds).toBe(3600)
  })

  it('dispatches the current version without rewriting the ledger', () => {
    const ledger = ledgerOf({ '2026-09-14': { current: contribution() } })
    const before = structuredClone(ledger)
    expect(buildVersionedFocusPeriod(ledger, {
      range: 'day', now: at(14), metricVersion: FOCUS_SCORE.metricVersion,
    }).score).not.toBeNull()
    expect(ledger).toEqual(before)
  })
})

describe('ledger persistence', () => {
  it('copies only genuine exact Deep Focus into new contributions', () => {
    const startedAt = at(14, 9).getTime()
    const base = {
      id: 'session', startedAt, timestamp: startedAt + 3_600_000,
      attentionScoringVersion: 2, focusMetricVersion: 1, focusMetricRejection: null,
      sessionEfficiency: 68, measuredSeconds: 3600, scoreSum: 3600 * 68,
      deepFocusSeconds: 0,
    }
    const exact = addSessionToFocusLedger(emptyFocusLedger(), {
      ...base, deepFocusTimeVersion: 2, flowSeconds: 900,
    }).days['2026-09-14'].sessions.session
    const legacy = addSessionToFocusLedger(emptyFocusLedger(), base).days['2026-09-14'].sessions.session
    expect(exact).toMatchObject({ startedAt, deepFocusTimeVersion: 2, flowSeconds: 900 })
    expect(legacy.flowSeconds).toBeUndefined()
  })

  it('enriches an existing contribution from its exact source session without rewriting stored measurements', () => {
    const startedAt = at(14, 9).getTime()
    const ledger = ledgerOf({
      '2026-09-14': {
        session: { ...contribution({ exact: false }), scoreSum: 100_000, source: 'live_v1' },
      },
    })
    const session = {
      id: 'session', startedAt, timestamp: startedAt + 3_600_000,
      attentionScoringVersion: 2, focusMetricVersion: 1, focusMetricRejection: null,
      sessionEfficiency: 68, measuredSeconds: 3600, scoreSum: 3600 * 68,
      deepFocusSeconds: 0, deepFocusTimeVersion: 2, flowSeconds: 900,
    }

    const enriched = backfillFocusLedger(ledger, [session]).days['2026-09-14'].sessions.session
    expect(enriched).toMatchObject({
      scoreSum: 100_000,
      startedAt,
      deepFocusTimeVersion: 2,
      flowSeconds: 900,
    })
  })
})
