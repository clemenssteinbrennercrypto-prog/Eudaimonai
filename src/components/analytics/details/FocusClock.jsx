import { useId, useState } from 'react'
import { annularSector, bucketHours, hourToAngle, polar } from '../chart/clockGeometry'
import { sessionLabel, svgId } from './format'

const SIZE = 300
const CENTER = SIZE / 2
const INNER = 66
const OUTER = 122
const GAP_DEGREES = 1.4

function sessionsText(row) {
  return row.sessions >= 3 ? sessionLabel(row.sessions) : row.sessions ? `${row.sessions}/3 collecting` : 'No sessions'
}

/**
 * The 24h focus clock. Radial length is the period's average attention on a
 * 0–100 scale from the inner ring, and each period spans its real hours, so
 * neither the value nor the share of the day is exaggerated. Periods without
 * three qualified sessions stay an outline — no bar is drawn for them.
 */
export default function FocusClock({ rows, comparison, usableCount, required }) {
  const [hoverId, setHoverId] = useState(null)
  const reactId = useId()
  const glowId = svgId(reactId, 'clock-glow')
  const bestId = comparison.best?.id
  const worstId = comparison.worst?.id
  const focusRow = rows.find(row => row.id === hoverId) || rows.find(row => row.id === bestId) || null
  const radius = value => INNER + ((OUTER - INNER) * value) / 100

  return (
    <div className="analytics-clock-layout">
      <div className="analytics-clock">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <defs>
            <radialGradient id={glowId} cx={CENTER} cy={CENTER} r={OUTER} gradientUnits="userSpaceOnUse">
              <stop offset={`${(INNER / OUTER) * 100}%`} stopColor="var(--ultra)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--ultra-bright)" stopOpacity="1" />
            </radialGradient>
          </defs>
          <circle className="analytics-clock-track" cx={CENTER} cy={CENTER} r={(INNER + OUTER) / 2} strokeWidth={OUTER - INNER} />
          {[50, 100].map(value => (
            <circle key={value} className="analytics-clock-ring" cx={CENTER} cy={CENTER} r={radius(value)} />
          ))}
          {Array.from({ length: 24 }, (_, hour) => {
            const major = hour % 6 === 0
            const a = polar(CENTER, CENTER, OUTER + 5, hourToAngle(hour))
            const b = polar(CENTER, CENTER, OUTER + (major ? 12 : 8), hourToAngle(hour))
            return <line key={hour} className={`analytics-clock-tick${major ? ' is-major' : ''}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          })}
          {[0, 6, 12, 18].map(hour => {
            const point = polar(CENTER, CENTER, OUTER + 22, hourToAngle(hour))
            return <text key={hour} className="analytics-clock-hour" x={point.x} y={point.y + 4} textAnchor="middle">{String(hour).padStart(2, '0')}</text>
          })}
          {rows.map((row, index) => {
            const hours = bucketHours(row.range)
            if (!hours) return null
            const start = hourToAngle(hours.start) + GAP_DEGREES
            const end = hourToAngle(hours.end) - GAP_DEGREES
            const populated = row.averageAttention != null
            const state = [
              populated ? 'is-populated' : 'is-collecting',
              row.id === bestId ? 'is-best' : '',
              row.id === worstId ? 'is-worst' : '',
              row.id === hoverId ? 'is-hovered' : '',
            ].filter(Boolean).join(' ')
            return (
              <g
                key={row.id}
                className={`analytics-clock-segment ${state}`}
                style={{ '--i': index }}
                onMouseEnter={() => setHoverId(row.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <path className="analytics-clock-slot" d={annularSector(CENTER, CENTER, INNER, OUTER, start, end)} />
                {populated && (
                  <path className="analytics-clock-value" d={annularSector(CENTER, CENTER, INNER, radius(row.averageAttention), start, end)} fill={`url(#${glowId})`} />
                )}
              </g>
            )
          })}
        </svg>
        <div className="analytics-clock-center">
          {focusRow ? (
            <>
              <strong>{focusRow.averageAttention ?? '—'}</strong>
              <span>{focusRow.label}</span>
              <small>{sessionsText(focusRow)}</small>
            </>
          ) : (
            <>
              <strong>{usableCount < required ? `${usableCount}/${required}` : usableCount}</strong>
              <span>Qualified sessions</span>
              <small>{comparison.ready ? 'No clear peak yet' : 'Collecting'}</small>
            </>
          )}
        </div>
      </div>
      <ul className="analytics-clock-list">
        {rows.map(row => (
          <li
            key={row.id}
            className={[
              row.id === bestId ? 'is-best' : '',
              row.id === worstId ? 'is-worst' : '',
              row.id === hoverId ? 'is-hovered' : '',
              row.averageAttention == null ? 'is-collecting' : '',
            ].filter(Boolean).join(' ') || undefined}
            onMouseEnter={() => setHoverId(row.id)}
            onMouseLeave={() => setHoverId(null)}
          >
            <small>{row.range}</small>
            <span>{row.label}</span>
            <strong>{row.averageAttention == null ? '—' : row.averageAttention}</strong>
            <em>{sessionsText(row)}</em>
          </li>
        ))}
      </ul>
    </div>
  )
}
