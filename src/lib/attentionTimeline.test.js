import { describe, expect, it } from 'vitest'
import { attentionTimelineBand, sampledAttentionBandSeconds } from './attentionTimeline'

describe('attention timeline bands', () => {
  it('keeps exact Deep Focus separate from a merely high score', () => {
    expect(attentionTimelineBand({ score: 80, deepFocused: true }).id).toBe('deep')
    expect(attentionTimelineBand({ score: 80, deepFocused: false }).id).toBe('high')
    expect(attentionTimelineBand({ score: 50 }).id).toBe('focused')
    expect(attentionTimelineBand({ score: 20 }).id).toBe('low')
    expect(attentionTimelineBand({}).id).toBe('unmeasured')
  })

  it('keeps sampled bands in chronological five-second spans', () => {
    expect(sampledAttentionBandSeconds([
      { second: 5, score: 20 },
      { second: 10, score: 75 },
      { second: 15, score: 80, deepFocused: true },
      { second: 20, score: 50 },
    ])).toEqual({ deep: 5, high: 5, focused: 5, low: 5, unmeasured: 0 })
  })

  it('does not turn a large gap between snapshots into measured time', () => {
    expect(sampledAttentionBandSeconds([
      { second: 5, score: 75 },
      { second: 65, score: 75 },
    ]).high).toBe(10)
  })
})
