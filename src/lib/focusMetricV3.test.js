import { describe, expect, it } from 'vitest'
import { buildFocusPeriod } from './focusMetric'
import { buildVersionedFocusPeriod } from './focusMetricV2'
import { buildFocusPeriodV3, FOCUS_METRIC_V3 } from './focusMetricV3'

const at = (day, hour = 12) => new Date(2026, 8, day, hour)
const contribution = (minutes, attention, extra = {}) => ({
  version: 1,
  generation: 2,
  measuredSeconds: minutes * 60,
  scoreSum: minutes * 60 * attention,
  deepFocusSeconds: minutes * 60,
  ...extra,
})
const ledger = sessions => ({
  schemaVersion: 1,
  days: { '2026-09-14': { sessions } },
})

describe('Focus Metric V3: measured attention quality only', () => {
  it('does not lower the score merely because the session is short', () => {
    const short = buildFocusPeriodV3(ledger({ short: contribution(10, 80) }), { range: 'day', now: at(14) })
    const long = buildFocusPeriodV3(ledger({ long: contribution(120, 80) }), { range: 'day', now: at(14) })
    expect(short.score).toBe(80)
    expect(long.score).toBe(80)
  })

  it('weights attention by measured seconds across sessions and days', () => {
    const data = ledger({ short: contribution(10, 20), long: contribution(30, 80) })
    expect(buildFocusPeriodV3(data, { range: 'week', now: at(16) })).toMatchObject({
      metricVersion: FOCUS_METRIC_V3.version,
      calculationSource: 'qualified_ledger_attention_quality_v1',
      score: 65,
      baseline: null,
    })
  })

  it('keeps V1 stored history untouched and dispatches versions explicitly', () => {
    const data = ledger({ work: contribution(30, 80) })
    const before = structuredClone(data)
    expect(buildFocusPeriod(data, { range: 'day', now: at(14) }).score).not.toBe(80)
    expect(buildVersionedFocusPeriod(data, { range: 'day', now: at(14), metricVersion: 3 }).score).toBe(80)
    expect(data).toEqual(before)
  })

  it('preserves minimum-duration and camera-generation boundaries', () => {
    const data = {
      schemaVersion: 1,
      days: {
        '2026-09-14': { sessions: { old: contribution(30, 90, { generation: 1 }) } },
        '2026-09-15': { sessions: { current: contribution(30, 70) } },
        '2026-09-16': { sessions: { thin: contribution(2, 100) } },
      },
    }
    const period = buildFocusPeriodV3(data, { range: 'week', now: at(17) })
    expect(period.days.slice(0, 4).map(day => day.status)).toEqual([
      'different_generation', 'measured', 'unmeasured', 'inactive',
    ])
    expect(period.score).toBe(70)
  })
})
