import { useState } from 'react'
import { formatDuration } from '../../../lib/durationFormat'
import { useCountUp } from '../chart/hooks'
import { sessionLabel } from './format'

export const PHASE_LABELS = {
  arrival: 'Arrival',
  ramp: 'Ramp',
  lock_in: 'Lock-in',
  fade: 'Fade',
  recovery: 'Recovery',
  drift: 'Drift',
}

const SIZE = 196
const RADIUS = 80
const STROKE = 16
// Two pixels of surface between neighbouring phases, in pathLength units.
const GAP = (2 / (2 * Math.PI * RADIUS)) * 100

function DeepFocusValue({ seconds }) {
  const animated = useCountUp(seconds)
  // Size for the final value so the text does not jump while counting up.
  const length = formatDuration(seconds).length
  return <strong className={length > 8 ? 'is-long' : length > 5 ? 'is-medium' : undefined}>{formatDuration(Math.round(animated))}</strong>
}

export default function PhaseDonut({ phases }) {
  const [hoverId, setHoverId] = useState(null)
  const deepFocus = phases.deepFocus
  const missingDeepFocusSessions = deepFocus.measuredSessions - deepFocus.trackedSessions
  const total = phases.rows.reduce((sum, row) => sum + row.seconds, 0)
  let offset = 0
  const arcs = phases.rows.map(row => {
    const share = total ? (row.seconds / total) * 100 : 0
    const arc = { ...row, start: offset, length: share }
    offset += share
    return arc
  })
  const hovered = phases.rows.find(row => row.id === hoverId)
  const multiple = arcs.length > 1

  return (
    <div className="analytics-phase-summary">
      <div className="analytics-phase-visual">
        <div className={`analytics-phase-donut${hovered ? ' has-hover' : ''}`}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-label={`Attention phases across ${sessionLabel(phases.tracedSessions)}`} role="img">
            <circle className="analytics-phase-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={STROKE} />
            <g className="analytics-phase-arcs" transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {arcs.map(arc => {
                const visible = Math.max(0.01, arc.length - (multiple ? GAP : 0))
                return (
                  <circle
                    key={arc.id}
                    className={`analytics-phase-arc is-${arc.id}${arc.id === hoverId ? ' is-hovered' : ''}`}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    strokeWidth={STROKE}
                    pathLength="100"
                    strokeDasharray={`${visible} ${100 - visible}`}
                    strokeDashoffset={-arc.start}
                    onMouseEnter={() => setHoverId(arc.id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    <title>{`${PHASE_LABELS[arc.id]}: ${arc.sharePct}%`}</title>
                  </circle>
                )
              })}
            </g>
          </svg>
          <div className={`analytics-deep-focus${deepFocus.complete ? '' : ' is-unavailable'}`} aria-label="Exact Deep Focus time">
            <span>Deep Focus</span>
            {deepFocus.complete ? <DeepFocusValue seconds={deepFocus.seconds} /> : <strong>Unavailable</strong>}
            <small>90 s+ of steady attention</small>
          </div>
          {hovered && (
            <div className="analytics-phase-hover" aria-hidden="true">
              <span>{PHASE_LABELS[hovered.id]}</span>
              <strong>{hovered.sharePct}%</strong>
              <small>{formatDuration(hovered.seconds)}</small>
            </div>
          )}
        </div>
        {phases.rows.length > 0 && (
          <div className="analytics-phase-list">
            {phases.rows.map(row => (
              <div
                key={row.id}
                className={row.id === hoverId ? 'is-hovered' : undefined}
                onMouseEnter={() => setHoverId(row.id)}
                onMouseLeave={() => setHoverId(null)}
              >
                <i className={`is-${row.id}`} />
                <span>{PHASE_LABELS[row.id]}</span>
                <strong>{row.sharePct}%</strong>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="analytics-deep-focus-note">
        {deepFocus.complete
          ? `Recorded across ${sessionLabel(deepFocus.trackedSessions)}. This time overlaps the attention phases.`
          : deepFocus.measuredSessions > 0
            ? `Deep Focus is missing from ${sessionLabel(missingDeepFocusSessions)} in this selection, so no partial total is shown.`
            : 'No qualified session in this selection has exact Flow time.'}
      </p>
    </div>
  )
}
