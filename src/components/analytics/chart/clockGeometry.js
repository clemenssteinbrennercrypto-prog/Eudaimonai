/**
 * Geometry for the 24h focus clock. Midnight sits at the top and hours run
 * clockwise, so each time bucket covers its real share of the day — the eight
 * hours of "Late night" stay visibly longer than a three-hour morning slot.
 */
export function bucketHours(range) {
  const match = /^(\d{1,2})\D+(\d{1,2})$/.exec(String(range || '').trim())
  if (!match) return null
  const start = Number(match[1])
  let end = Number(match[2])
  if (end <= start) end += 24
  return { start, end }
}

export function hourToAngle(hour) {
  return (hour / 24) * 360
}

export function polar(cx, cy, radius, angleDegrees) {
  const radians = ((angleDegrees - 90) * Math.PI) / 180
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) }
}

const round = value => Math.round(value * 100) / 100

/** Closed annular sector between two angles (degrees, clockwise from 12 o'clock). */
export function annularSector(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  const large = endAngle - startAngle > 180 ? 1 : 0
  const outerStart = polar(cx, cy, outerRadius, startAngle)
  const outerEnd = polar(cx, cy, outerRadius, endAngle)
  const innerEnd = polar(cx, cy, innerRadius, endAngle)
  const innerStart = polar(cx, cy, innerRadius, startAngle)
  return [
    `M ${round(outerStart.x)} ${round(outerStart.y)}`,
    `A ${outerRadius} ${outerRadius} 0 ${large} 1 ${round(outerEnd.x)} ${round(outerEnd.y)}`,
    `L ${round(innerEnd.x)} ${round(innerEnd.y)}`,
    `A ${innerRadius} ${innerRadius} 0 ${large} 0 ${round(innerStart.x)} ${round(innerStart.y)}`,
    'Z',
  ].join(' ')
}
