import { useMemo, useState } from 'react'
import {
  buildDetailsSummary,
  filterDetailsSessions,
  knownComparableSessions,
} from '../../lib/analyticsModel'
import { formatMinutes } from '../../lib/durationFormat'
import SessionDetailView from './sessions/SessionDetailView'

const RANGE_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All' },
]

const OUTCOME_OPTIONS = [
  ['all', 'All outcomes'],
  ['yes', 'Reached'],
  ['partly', 'Partly'],
  ['no', 'Missed'],
  ['unrated', 'Unrated'],
]

const OUTCOME_META = {
  yes: { label: 'Reached', className: 'is-reached' },
  partly: { label: 'Partly', className: 'is-partly' },
  no: { label: 'Missed', className: 'is-missed' },
  unrated: { label: 'Unrated', className: 'is-unrated' },
}

const PHASE_LABELS = {
  arrival: 'Arrival',
  ramp: 'Ramp',
  lock_in: 'Lock-in',
  fade: 'Fade',
  recovery: 'Recovery',
  drift: 'Drift',
}

function fmtDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function sessionLabel(count) {
  return `${count} ${count === 1 ? 'session' : 'sessions'}`
}

function pointDescription(point) {
  const outcome = OUTCOME_META[point.outcome || 'unrated'].label
  const attention = point.averageAttention == null ? 'not measured' : `${point.averageAttention} average attention`
  const duration = point.durationMinutes == null ? '' : `, ${formatMinutes(point.durationMinutes)}`
  const workspace = point.workspace ? `, ${point.workspace}` : ''
  const qualification = point.trackingFaulted
    ? ', partial measurement excluded from comparisons'
    : point.qualified === false ? ', too short for comparisons' : ''
  return `${fmtDate(point.timestamp)}: ${attention}${duration}${workspace}, ${outcome}${qualification}`
}

function PlotPoint({ point, cx, cy, onSelect, radius = 7, hitRadius = Math.max(18, radius * 2) }) {
  const outcome = point.outcome || 'unrated'
  const className = `analytics-point ${OUTCOME_META[outcome].className}${point.qualified === false ? ' is-unqualified' : ''}`
  const common = {
    className,
    role: 'button',
    tabIndex: 0,
    'aria-label': `${pointDescription(point)}. Open session details.`,
    onClick: () => onSelect(point.id),
    onKeyDown: event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onSelect(point.id)
      }
    },
  }

  let mark = <circle className="analytics-point-mark" cx={cx} cy={cy} r={radius} />
  if (outcome === 'partly') {
    const size = radius * 1.45
    mark = <rect className="analytics-point-mark" x={cx - size / 2} y={cy - size / 2} width={size} height={size} transform={`rotate(45 ${cx} ${cy})`} />
  } else if (outcome === 'no') {
    mark = <rect className="analytics-point-mark" x={cx - radius * 0.72} y={cy - radius * 0.72} width={radius * 1.44} height={radius * 1.44} />
  }
  return (
    <g {...common}>
      <circle className="analytics-point-hit" cx={cx} cy={cy} r={hitRadius} />
      {mark}
      <title>{pointDescription(point)}</title>
    </g>
  )
}

function UnmeasuredPoint({ point, cx, cy, onSelect }) {
  const activate = event => {
    if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return
    event?.preventDefault()
    onSelect(point.id)
  }
  return (
    <g
      className="analytics-unmeasured-mark"
      role="button"
      tabIndex={0}
      aria-label={`${pointDescription(point)}. Open session details.`}
      onClick={activate}
      onKeyDown={activate}
    >
      <circle cx={cx} cy={cy} r="18" />
      <line x1={cx - 4} x2={cx + 4} y1={cy + 4} y2={cy - 4} />
      <title>{pointDescription(point)}</title>
    </g>
  )
}

function SectionHeading({ kicker, title, meta, id }) {
  return (
    <div className="analytics-details-heading">
      <div>
        <span>{kicker}</span>
        <h2 id={id}>{title}</h2>
      </div>
      {meta && <b>{meta}</b>}
    </div>
  )
}

function FocusTrend({ rows, onSelect }) {
  const measuredCount = rows.filter(row => row.averageAttention != null).length
  if (measuredCount === 0) return <p className="analytics-details-empty">No measured sessions match these filters.</p>

  const x = index => rows.length === 1 ? 510 : 56 + (index / (rows.length - 1)) * 920
  const y = value => 232 - value * 2.05
  const segments = []
  let segment = []
  rows.forEach((row, index) => {
    if (row.averageAttention == null) {
      if (segment.length) segments.push(segment)
      segment = []
      return
    }
    segment.push({ row, index })
  })
  if (segment.length) segments.push(segment)
  const hasUnmeasured = rows.some(row => row.averageAttention == null)
  const labelIndexes = new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])

  return (
    <svg className="analytics-main-plot" viewBox="0 0 1000 310" role="group" aria-label={`Average attention across ${sessionLabel(measuredCount)} with measurements`}>
      {[25, 50, 75, 100].map(value => (
        <g key={value}>
          <line x1="56" x2="976" y1={y(value)} y2={y(value)} />
          <text x="42" y={y(value) + 4} textAnchor="end">{value}</text>
        </g>
      ))}
      {segments.map((items, index) => (
        <path
          key={index}
          d={items.map((item, pointIndex) => `${pointIndex ? 'L' : 'M'} ${x(item.index)} ${y(item.row.averageAttention)}`).join(' ')}
        />
      ))}
      {hasUnmeasured && (
        <g className="analytics-unmeasured-axis">
          <line x1="56" x2="976" y1="258" y2="258" />
          <text x="42" y="262" textAnchor="end">N/A</text>
        </g>
      )}
      {rows.map((point, index) => point.averageAttention == null ? (
        <UnmeasuredPoint key={point.id} point={point} cx={x(index)} cy={258} onSelect={onSelect} />
      ) : (
        <PlotPoint key={point.id} point={point} cx={x(index)} cy={y(point.averageAttention)} onSelect={onSelect} />
      ))}
      {rows.map((point, index) => labelIndexes.has(index) && (
        <text key={`label-${point.id}`} x={x(index)} y="302" textAnchor={index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'}>{fmtDate(point.timestamp)}</text>
      ))}
    </svg>
  )
}

function OutcomeStrip({ outcomes }) {
  const total = Object.values(outcomes).reduce((sum, value) => sum + value, 0)
  if (!total) return null
  return (
    <div className="analytics-outcome-summary" aria-label={`Outcomes across ${sessionLabel(total)}`}>
      <div className="analytics-outcome-track">
        {Object.entries(OUTCOME_META).map(([key, meta]) => outcomes[key] > 0 && (
          <i key={key} className={meta.className} style={{ width: `${(outcomes[key] / total) * 100}%` }} />
        ))}
      </div>
      <div className="analytics-outcome-key">
        {Object.entries(OUTCOME_META).map(([key, meta]) => (
          <span key={key}><i className={meta.className} />{meta.label} <b>{outcomes[key]}</b></span>
        ))}
      </div>
    </div>
  )
}

function AttentionDistribution({ distribution, onSelect }) {
  const rows = distribution.sessions
  if (!rows.length) return null
  const x = value => 48 + value * 9.18
  const maxVisiblePerScore = 5
  const grouped = new Map()
  for (const point of rows) {
    if (!grouped.has(point.averageAttention)) grouped.set(point.averageAttention, [])
    grouped.get(point.averageAttention).push(point)
  }
  const groups = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([attention, sessions]) => ({
      attention,
      sessions: sessions.sort((a, b) => b.timestamp - a.timestamp),
    }))
  const points = groups.flatMap(group => group.sessions.slice(0, maxVisiblePerScore).map((point, lane) => ({
    point,
    lane,
    x: x(group.attention),
  })))
  const overflowClusters = []
  for (const group of groups.filter(item => item.sessions.length > maxVisiblePerScore)) {
    const previous = overflowClusters.at(-1)
    if (previous && x(group.attention) - x(previous.maxAttention) < 40) {
      previous.groups.push(group)
      previous.maxAttention = group.attention
    } else {
      overflowClusters.push({ groups: [group], minAttention: group.attention, maxAttention: group.attention })
    }
  }
  const axisY = 100
  const viewHeight = 128
  return (
    <svg className="analytics-distribution-plot" viewBox={`0 0 1000 ${viewHeight}`} role="group" aria-label={`Distribution of ${sessionLabel(distribution.count)} with measured averages`}>
      <rect className="analytics-distribution-band" x={x(distribution.q1)} y="8" width={Math.max(2, x(distribution.q3) - x(distribution.q1))} height={axisY - 14} />
      <line className="analytics-distribution-median" x1={x(distribution.median)} x2={x(distribution.median)} y1="8" y2={axisY} />
      <line x1="48" x2="966" y1={axisY} y2={axisY} />
      {[0, 25, 50, 75, 100].map(value => <text key={value} x={x(value)} y={axisY + 20} textAnchor={value === 0 ? 'start' : value === 100 ? 'end' : 'middle'}>{value}</text>)}
      {points.map(({ point, lane, x: pointX }) => (
        <PlotPoint key={point.id} point={point} cx={pointX} cy={axisY - 16 - lane * 14} onSelect={onSelect} radius={4} hitRadius={7} />
      ))}
      {overflowClusters.map(cluster => {
        const hidden = cluster.groups.reduce((sum, group) => sum + group.sessions.length - maxVisiblePerScore, 0)
        const scoreRange = cluster.minAttention === cluster.maxAttention
          ? String(cluster.minAttention)
          : `${cluster.minAttention}–${cluster.maxAttention}`
        const label = `${hidden} more ${hidden === 1 ? 'session' : 'sessions'} at ${scoreRange} average attention; each remains available in Focus by session`
        const labelX = (x(cluster.minAttention) + x(cluster.maxAttention)) / 2
        return (
          <g key={`overflow-${scoreRange}`} className="analytics-distribution-overflow" role="img" aria-label={label}>
            <text x={labelX} y="16" textAnchor="middle">+{hidden}</text>
            <title>{label}</title>
          </g>
        )
      })}
    </svg>
  )
}

function ConditionSignal({ comparison }) {
  if (!comparison.ready) return null
  if (!comparison.best || !comparison.worst) {
    return <p className="analytics-condition-signal">No clear difference yet in this selection.</p>
  }
  const difference = comparison.best.averageAttention - comparison.worst.averageAttention
  return (
    <p className="analytics-condition-signal">
      <strong>{comparison.best.label}</strong> records {difference} points higher average attention than {comparison.worst.label}.
    </p>
  )
}

function TimeOfDay({ data }) {
  const bestId = data.comparison.best?.id
  const worstId = data.comparison.worst?.id
  return (
    <>
      <ConditionSignal comparison={data.comparison} />
      <div className="analytics-time-strip">
        {data.rows.map(row => (
          <div key={row.id} className={`${row.id === bestId ? 'is-best' : ''} ${row.id === worstId ? 'is-worst' : ''}`.trim()}>
            <small>{row.range}</small>
            <strong>{row.averageAttention == null ? '—' : row.averageAttention}</strong>
            <span>{row.label}</span>
            <em>{row.sessions >= 3 ? sessionLabel(row.sessions) : row.sessions ? `${row.sessions}/3 collecting` : 'No sessions'}</em>
          </div>
        ))}
      </div>
    </>
  )
}

function WorkspaceComparison({ data }) {
  const rows = data.rows.filter(row => row.averageAttention != null)
  const bestId = data.comparison.best?.id
  const worstId = data.comparison.worst?.id
  const duplicateLabels = new Set(rows.filter((row, index) => rows.findIndex(other => other.label === row.label) !== index).map(row => row.label))
  return (
    <>
      <ConditionSignal comparison={data.comparison} />
      <div className="analytics-workspace-list">
        {rows.map(row => (
          <div key={row.id} className={`${row.id === bestId ? 'is-best' : ''} ${row.id === worstId ? 'is-worst' : ''}`.trim()}>
            <div>
              <span>{row.label}{duplicateLabels.has(row.label) ? ` · setup v${row.revision}` : ''}</span>
              <small>{sessionLabel(row.sessions)}{row.outcomeRate == null ? '' : ` · ${row.outcomeRate}% goals reached`}</small>
            </div>
            <i><b style={{ width: `${row.averageAttention}%` }} /></i>
            <strong>{row.averageAttention}</strong>
          </div>
        ))}
      </div>
    </>
  )
}

function DurationPlot({ rows, onSelect }) {
  const maxDuration = Math.max(30, ...rows.map(row => row.durationMinutes))
  const x = value => 56 + (value / maxDuration) * 900
  const y = value => 222 - value * 1.9
  return (
    <svg className="analytics-secondary-plot" viewBox="0 0 1000 260" role="group" aria-label={`Session length and average attention across ${sessionLabel(rows.length)}`}>
      {[25, 50, 75, 100].map(value => <line key={value} x1="56" x2="956" y1={y(value)} y2={y(value)} />)}
      {rows.map(point => <PlotPoint key={point.id} point={point} cx={x(point.durationMinutes)} cy={y(point.averageAttention)} onSelect={onSelect} radius={6} />)}
      <text x="56" y="250">0 min</text>
      <text x="956" y="250" textAnchor="end">{formatMinutes(maxDuration)}</text>
    </svg>
  )
}

function PhaseShare({ phases }) {
  return (
    <div className="analytics-phase-summary">
      <div className="analytics-phase-track" aria-label={`Attention phases across ${sessionLabel(phases.tracedSessions)}`}>
        {phases.rows.map(row => <i key={row.id} className={`is-${row.id}`} style={{ width: `${row.sharePct}%` }} title={`${PHASE_LABELS[row.id]}: ${row.sharePct}%`} />)}
      </div>
      <div className="analytics-phase-list">
        {phases.rows.map(row => (
          <div key={row.id}>
            <i className={`is-${row.id}`} />
            <span>{PHASE_LABELS[row.id]}</span>
            <strong>{row.sharePct}%</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DataExplorer({ sessions, selectedSessionId, onSelectSession, onUpdateSession }) {
  const [range, setRange] = useState('all')
  const [outcome, setOutcome] = useState('all')
  const [workspace, setWorkspace] = useState('all')

  const comparable = useMemo(() => knownComparableSessions(sessions), [sessions])
  const workspaces = useMemo(() => {
    const seen = new Map()
    for (const session of comparable) {
      if (session.workspace?.id && !seen.has(session.workspace.id)) {
        seen.set(session.workspace.id, session.workspace.name || session.workspace.id)
      }
    }
    return [...seen.entries()]
  }, [comparable])
  const filtered = useMemo(() => filterDetailsSessions(sessions, { range, outcome, workspace }), [sessions, range, outcome, workspace])
  const details = useMemo(() => buildDetailsSummary(filtered), [filtered])
  const selectedSession = selectedSessionId ? sessions.find(session => session.id === selectedSessionId) : null

  if (selectedSession) {
    return (
      <SessionDetailView
        session={selectedSession}
        allSessions={sessions}
        onBack={() => onSelectSession(null)}
        onUpdateSession={onUpdateSession}
        backLabel="← Details"
      />
    )
  }

  const resetVisible = range !== 'all' || outcome !== 'all' || workspace !== 'all'
  const timeReady = details.conditions.usableCount >= details.conditions.required &&
    details.conditions.timeOfDay.rows.filter(row => row.averageAttention != null).length >= 2
  const workspaceReady = details.conditions.usableCount >= details.conditions.required &&
    details.conditions.workspace.rows.filter(row => row.averageAttention != null).length >= 2
  const durationReady = details.duration.length >= 3
  const phasesReady = details.phases.totalSeconds > 0
  const noConditionReady = !timeReady && !workspaceReady

  return (
    <div className="analytics-explorer analytics-details">
      <div className="analytics-details-filters">
        <div className="analytics-range-switch" aria-label="Date range">
          {RANGE_OPTIONS.map(option => (
            <button key={option.value} type="button" className={range === option.value ? 'is-active' : ''} aria-pressed={range === option.value} onClick={() => setRange(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <label>
          <span>Outcome</span>
          <select value={outcome} onChange={event => setOutcome(event.target.value)}>
            {OUTCOME_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>Workspace</span>
          <select value={workspace} onChange={event => setWorkspace(event.target.value)}>
            <option value="all">All workspaces</option>
            {workspaces.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <div className="analytics-filter-count">
          <strong>{details.sessionCount}</strong>
          <span>{details.sessionCount === 1 ? 'session' : 'sessions'} · {details.measuredCount} measured</span>
        </div>
        {resetVisible && <button type="button" className="analytics-filter-reset" onClick={() => { setRange('all'); setOutcome('all'); setWorkspace('all') }}>Reset</button>}
      </div>

      {details.sessionCount === 0 ? (
        <div className="analytics-details-zero">
          <strong>No sessions match these filters.</strong>
          <p>Reset the filters to return to your complete comparable history.</p>
        </div>
      ) : (
        <>
          <section className="analytics-details-section analytics-details-hero" aria-labelledby="focus-trend-heading">
            <SectionHeading kicker="Development" title="Focus by session" id="focus-trend-heading" meta={`${details.measuredCount} measured`} />
            <FocusTrend rows={details.timeline} onSelect={onSelectSession} />
            <OutcomeStrip outcomes={details.outcomes} />
          </section>

          {details.distribution.count > 0 && (
            <section className="analytics-details-section" aria-labelledby="attention-distribution-heading">
              <SectionHeading kicker="Distribution" title="Session average attention" id="attention-distribution-heading" meta={`median ${details.distribution.median} · middle 50% ${details.distribution.q1}–${details.distribution.q3}`} />
              <AttentionDistribution distribution={details.distribution} onSelect={onSelectSession} />
            </section>
          )}

          {(timeReady || workspaceReady) && (
            <section className="analytics-details-section" aria-labelledby="conditions-heading">
              <SectionHeading kicker="Conditions" title="Where and when focus is strongest" id="conditions-heading" meta={`${details.conditions.usableCount} qualified sessions`} />
              <div className="analytics-condition-grid">
                {timeReady && (
                  <div>
                    <h3>Time of day</h3>
                    <TimeOfDay data={details.conditions.timeOfDay} />
                  </div>
                )}
                {workspaceReady && (
                  <div>
                    <h3>Workspace</h3>
                    <WorkspaceComparison data={details.conditions.workspace} />
                  </div>
                )}
              </div>
            </section>
          )}

          {(durationReady || phasesReady) && (
            <section className="analytics-details-section" aria-labelledby="rhythm-heading">
              <SectionHeading kicker="Work rhythm" title="How your sessions behave" id="rhythm-heading" />
              <div className="analytics-rhythm-grid">
                {durationReady && (
                  <div>
                    <h3>Session length vs attention</h3>
                    <DurationPlot rows={details.duration} onSelect={onSelectSession} />
                  </div>
                )}
                {phasesReady && (
                  <div>
                    <h3>Attention phases</h3>
                    <p>{sessionLabel(details.phases.tracedSessions)} with phase data</p>
                    <PhaseShare phases={details.phases} />
                  </div>
                )}
              </div>
            </section>
          )}

          {noConditionReady && (
            <p className="analytics-details-collecting">
              {details.conditions.usableCount < details.conditions.required
                ? `Stronger time and workspace comparisons appear after ${details.conditions.required - details.conditions.usableCount} more qualified ${details.conditions.required - details.conditions.usableCount === 1 ? 'session' : 'sessions'}. Until then, Details shows only directly observed session data.`
                : 'Time-of-day and workspace comparisons each need at least two groups with 3 qualified sessions.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
