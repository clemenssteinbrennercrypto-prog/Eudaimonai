/**
 * Monotone cubic interpolation (Fritsch–Carlson, the same rule as d3's
 * curveMonotoneX). Each segment stays between its two endpoint values, so the
 * curve never invents a peak above or a dip below what was measured — a plain
 * Catmull-Rom spline would, and a smoothed line must not overstate a session.
 */
function sign(value) {
  return value < 0 ? -1 : 1
}

function secant(a, b) {
  const h = b.x - a.x
  return h === 0 ? 0 : (b.y - a.y) / h
}

function tangents(points) {
  const count = points.length
  const result = new Array(count).fill(0)
  if (count < 2) return result
  for (let index = 1; index < count - 1; index += 1) {
    const prev = points[index - 1]
    const current = points[index]
    const next = points[index + 1]
    const h0 = current.x - prev.x
    const h1 = next.x - current.x
    const s0 = secant(prev, current)
    const s1 = secant(current, next)
    const p = h0 + h1 === 0 ? 0 : (s0 * h1 + s1 * h0) / (h0 + h1)
    result[index] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
  }
  const endTangent = (a, b, t) => {
    const h = b.x - a.x
    return h ? (3 * (b.y - a.y) / h - t) / 2 : t
  }
  result[0] = count === 2 ? secant(points[0], points[1]) : endTangent(points[0], points[1], result[1])
  result[count - 1] = count === 2
    ? result[0]
    : endTangent(points[count - 2], points[count - 1], result[count - 2])
  return result
}

/** Cubic segments as [start, control1, control2, end] for testing and drawing. */
export function monotoneSegments(points) {
  const slopes = tangents(points)
  const segments = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]
    const b = points[index + 1]
    const dx = (b.x - a.x) / 3
    segments.push([
      a,
      { x: a.x + dx, y: a.y + dx * slopes[index] },
      { x: b.x - dx, y: b.y - dx * slopes[index + 1] },
      b,
    ])
  }
  return segments
}

const round = value => Math.round(value * 100) / 100

export function smoothLinePath(points) {
  if (!points.length) return ''
  const start = `M ${round(points[0].x)} ${round(points[0].y)}`
  if (points.length === 1) return start
  return [start, ...monotoneSegments(points).map(([, c1, c2, end]) =>
    `C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(end.x)} ${round(end.y)}`)].join(' ')
}

export function smoothAreaPath(points, baselineY) {
  if (points.length < 2) return ''
  const first = points[0]
  const last = points.at(-1)
  return `${smoothLinePath(points)} L ${round(last.x)} ${round(baselineY)} L ${round(first.x)} ${round(baselineY)} Z`
}
