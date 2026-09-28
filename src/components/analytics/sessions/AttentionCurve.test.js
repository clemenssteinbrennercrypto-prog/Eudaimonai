import { describe, expect, it } from 'vitest'
import { bucketAttention } from './AttentionCurve'

describe('session attention curve buckets', () => {
  it('averages samples per bucket and never bridges a gap without samples', () => {
    const timeline = [
      { second: 5, score: 80 }, { second: 10, score: 60 },
      { second: 15, score: 40 }, { second: 20, score: 20 },
      // nothing recorded between 20s and 60s: a pause or camera gap
      { second: 60, wallSecond: 60, score: 90 }, { second: 65, wallSecond: 65, score: 70 },
    ]
    const { bucketSeconds, segments } = bucketAttention(timeline, 70, 7)
    expect(bucketSeconds).toBe(10)
    expect(segments).toHaveLength(2)
    expect(segments[0].map(bucket => bucket.score)).toEqual([80, 50, 20])
    expect(segments[1].map(bucket => bucket.score)).toEqual([80])
  })

  it('ignores unmeasured samples instead of plotting them as zero', () => {
    const { segments } = bucketAttention([{ second: 5, score: null }, { second: 10, focused: true }], 60, 12)
    expect(segments).toEqual([])
  })
})
