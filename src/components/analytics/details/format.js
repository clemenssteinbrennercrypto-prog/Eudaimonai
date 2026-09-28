import { formatMinutes } from '../../../lib/durationFormat'

export const OUTCOME_META = {
  yes: { label: 'Reached', className: 'is-reached' },
  partly: { label: 'Partly', className: 'is-partly' },
  no: { label: 'Missed', className: 'is-missed' },
  unrated: { label: 'Unrated', className: 'is-unrated' },
}

export function fmtDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fmtWeekdayDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function sessionLabel(count) {
  return `${count} ${count === 1 ? 'session' : 'sessions'}`
}

export function pointDescription(point) {
  const outcome = OUTCOME_META[point.outcome || 'unrated'].label
  const attention = point.averageAttention == null ? 'not measured' : `${point.averageAttention} average attention`
  const duration = point.durationMinutes == null ? '' : `, ${formatMinutes(point.durationMinutes)}`
  const workspace = point.workspace ? `, ${point.workspace}` : ''
  const qualification = point.exclusion === 'tracking_fault'
    ? ', partial measurement excluded from comparisons'
    : point.exclusion === 'short_session' ? ', session under 10 minutes excluded from Analytics'
      : point.exclusion === 'short_measurement' ? ', under 10 minutes of reliable measurement excluded from Analytics'
        : point.exclusion ? ', not included in Analytics comparisons' : ''
  return `${fmtDate(point.timestamp)}: ${attention}${duration}${workspace}, ${outcome}${qualification}`
}

/** SVG ids must not contain the colons React's useId produces. */
export function svgId(reactId, name) {
  return `${name}-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`
}
