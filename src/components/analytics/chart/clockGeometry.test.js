import { describe, expect, it } from 'vitest'
import { DETAILS_TIME_BUCKETS } from '../../../lib/analyticsModel'
import { annularSector, bucketHours, hourToAngle } from './clockGeometry'

describe('focus clock geometry', () => {
  it('places buckets on their real hours and wraps late night across midnight', () => {
    expect(bucketHours('06–09')).toEqual({ start: 6, end: 9 })
    expect(bucketHours('22–06')).toEqual({ start: 22, end: 30 })
    expect(hourToAngle(6)).toBe(90)
    expect(hourToAngle(30) - hourToAngle(22)).toBe(120)
  })

  it('covers the whole day exactly once with the Details buckets', () => {
    const spans = DETAILS_TIME_BUCKETS.map(bucket => bucketHours(bucket.range))
    expect(spans.every(Boolean)).toBe(true)
    expect(spans.reduce((sum, span) => sum + span.end - span.start, 0)).toBe(24)
  })

  it('uses the large-arc flag only for sectors over half the dial', () => {
    expect(annularSector(0, 0, 10, 20, 0, 90)).toContain('A 20 20 0 0 1')
    expect(annularSector(0, 0, 10, 20, 0, 200)).toContain('A 20 20 0 1 1')
  })
})
