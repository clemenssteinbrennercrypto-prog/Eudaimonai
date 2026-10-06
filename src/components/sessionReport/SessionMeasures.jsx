import { useMemo } from 'react'
import { deriveSessionMeasures } from '../../lib/sessionMeasures'
import { fmtDuration } from '../../lib/sessionAnalysisPresentation'

function formatRate(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * Stability and continuity measures computed from the session's 5 s timeline
 * (AGENTS.md §11). Only measures that could be computed are shown; when none
 * could, nothing renders rather than a row of dashes.
 */
export default function SessionMeasures({ session }) {
  const measures = useMemo(() => deriveSessionMeasures(session), [session])
  const items = []
  if (measures.longestDeepFocusSeconds != null) {
    items.push({
      key: 'block',
      label: 'Longest Deep Focus block',
      value: measures.longestDeepFocusSeconds > 0 ? fmtDuration(measures.longestDeepFocusSeconds) : 'None',
      title: 'Longest unbroken Deep Focus stretch, measured from when the 90 s entry completed, to the nearest 5 s.',
    })
  }
  if (measures.lapses) {
    items.push({
      key: 'lapses',
      label: 'Lapses',
      value: `${formatRate(measures.lapses.perHour)}/h`,
      detail: `${measures.lapses.count} in this session`,
      title: 'Times attention stayed below the focused threshold for 10 s or more, per measured hour.',
    })
  }
  if (measures.recovery) {
    items.push({
      key: 'recovery',
      label: 'Recovery',
      value: fmtDuration(Math.round(measures.recovery.medianSeconds)),
      detail: 'median',
      title: 'Median time from the start of a lapse until attention was back for 10 s or more.',
    })
  }
  if (measures.switches) {
    items.push({
      key: 'switches',
      label: 'App switches',
      value: `${formatRate(measures.switches.perHour)}/h`,
      detail: `${measures.switches.count} in this session`,
      title: 'Changes between apps or sites that each held for 10 s or more, per measured hour.',
    })
  }
  if (!items.length) return null

  return (
    <dl className="session-measures" aria-label="Session measures">
      {items.map(item => (
        <div key={item.key} title={item.title}>
          <dt>{item.label}</dt>
          <dd>
            <strong>{item.value}</strong>
            {item.detail && <small>{item.detail}</small>}
          </dd>
        </div>
      ))}
    </dl>
  )
}
