import { describe, expect, it } from 'vitest'
import { buildLabEditorialLine } from './labEditorial'

const day = { start: new Date(2026, 9, 2), endExclusive: new Date(2026, 9, 3), range: 'day', now: new Date(2026, 9, 2, 20).getTime() }
const measured = (task, hour, minutes, attention) => ({
  task,
  startedAt: new Date(2026, 9, 2, hour).getTime(),
  actualSeconds: minutes * 60,
  focusMetricVersion: 1,
  focusMetricRejection: null,
  sessionEfficiency: attention,
})

describe('buildLabEditorialLine', () => {
  it('stays silent without sessions', () => {
    expect(buildLabEditorialLine([], day)).toBeNull()
  })

  it('stays silent when no session carries a validated attention value', () => {
    const rejected = { ...measured('Rejected', 9, 40, 90), focusMetricRejection: 'insufficient_duration' }
    const noValue = { ...measured('Unmeasured', 11, 40, null) }
    const wrongVersion = { ...measured('Legacy', 13, 40, 95), focusMetricVersion: 0 }
    expect(buildLabEditorialLine([rejected, noValue, wrongVersion], day)).toBeNull()
  })

  it('never calls an unmeasured session the best one', () => {
    const line = buildLabEditorialLine([measured('Measured', 9, 30, 61), { ...measured('Higher but rejected', 11, 50, 99), focusMetricRejection: 'invalid_measurement' }], day)
    expect(line).toBe('One measured session: Measured, 30m at attention 61.')
  })

  it('names the highest-attention session and breaks ties by length', () => {
    const line = buildLabEditorialLine([
      measured('Short', 9, 20, 84),
      measured('Long', 11, 55, 84),
      measured('Lower', 14, 60, 70),
    ], day)
    expect(line).toBe('Best session of the day: Long, 55m at attention 84.')
  })

  it('ignores sessions outside the period or in the future', () => {
    const yesterday = { ...measured('Yesterday', 9, 30, 99), startedAt: new Date(2026, 9, 1, 9).getTime() }
    const later = { ...measured('Later today', 22, 30, 99) }
    expect(buildLabEditorialLine([yesterday, later, measured('Today', 9, 30, 72)], day))
      .toBe('One measured session: Today, 30m at attention 72.')
  })
})
