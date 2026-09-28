import { describe, expect, it } from 'vitest'
import { monotoneSegments, smoothAreaPath, smoothLinePath } from './smoothPath'

function sampleCubic([p0, p1, p2, p3], t) {
  const u = 1 - t
  return {
    x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
  }
}

describe('smoothPath', () => {
  it('never overshoots the measured values between two points', () => {
    const points = [
      { x: 0, y: 40 }, { x: 10, y: 95 }, { x: 14, y: 20 }, { x: 40, y: 22 }, { x: 41, y: 100 }, { x: 80, y: 0 },
    ]
    for (const segment of monotoneSegments(points)) {
      const low = Math.min(segment[0].y, segment[3].y)
      const high = Math.max(segment[0].y, segment[3].y)
      for (let step = 0; step <= 20; step += 1) {
        const { x, y } = sampleCubic(segment, step / 20)
        expect(y).toBeGreaterThanOrEqual(low - 1e-9)
        expect(y).toBeLessThanOrEqual(high + 1e-9)
        expect(x).toBeGreaterThanOrEqual(segment[0].x - 1e-9)
        expect(x).toBeLessThanOrEqual(segment[3].x + 1e-9)
      }
    }
  })

  it('keeps a flat run flat instead of rippling', () => {
    const segments = monotoneSegments([{ x: 0, y: 50 }, { x: 5, y: 50 }, { x: 10, y: 50 }])
    for (const segment of segments) {
      for (const point of segment) expect(point.y).toBe(50)
    }
  })

  it('tolerates repeated x positions without producing NaN', () => {
    const path = smoothLinePath([{ x: 3, y: 10 }, { x: 3, y: 60 }, { x: 9, y: 40 }])
    expect(path).not.toMatch(/NaN|Infinity/)
  })

  it('draws a single point as a move and closes the area on the baseline', () => {
    expect(smoothLinePath([{ x: 1, y: 2 }])).toBe('M 1 2')
    expect(smoothAreaPath([{ x: 0, y: 10 }, { x: 10, y: 20 }], 100)).toMatch(/L 10 100 L 0 100 Z$/)
  })
})
