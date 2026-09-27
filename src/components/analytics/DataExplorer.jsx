import { useMemo, useState } from 'react'
import {
  buildDetailsSummary,
  filterDetailsSessions,
  knownMeasurementSessions,
} from '../../lib/analyticsModel'
import { formatDuration, formatMinutes } from '../../lib/durationFormat'
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
  const qualification = point.exclusion === 'tracking_fault'
    ? ', partial measurement excluded from comparisons'
    : point.exclusion === 'short_session' ? ', session under 10 minutes excluded from Analytics'
      : point.exclusion === 'short_measurement' ? ', under 10 minutes of reliable measurement excluded from Analytics'
        : point.exclusion ? ', not included in Analytics comparisons' : ''
  return `${fmtDate(point.timestamp)}: ${attention}${duration}${workspace}, ${outcome}${qualification}`
}

function FocusPoint({ point, cx, cy, onSelect }) {
  const activate = event => {
    if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return
    event?.preventDefault()
    onSelect(point.id)
  }
  return (
    <g
      className={`analytics-focus-point ${point.currentGeneration ? 'is-current-generation' : 'is-earlier-generation'}`}
      role="button"
      tabIndex={0}
      aria-label={`${pointDescription(point)}. Open session details.`}
      onClick={activate}
      onKeyDown={activate}
    >
      <circle className="analytics-point-hit" cx={cx} cy={cy} r="16" />
      <circle className="analytics-focus-point-mark" cx={cx} cy={cy} r="5" />
      <title>{pointDescription(point)}</title>
    </g>
  )
}

function SectionHeading({ kicker, title, description, meta, id }) {
  return (
    <div className="analytics-details-heading">
      <div>
        <span>{kicker}</span>
        <h2 id={id}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {meta && <b>{meta}</b>}
    </div>
  )
}

function DetailsIndex({ sections }) {
  const openSection = id => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <nav className="analytics-details-index" aria-label="Details sections">
      <span>Explore</span>
      {sections.map((section, index) => (
        <button key={section.id} type="button" onClick={() => openSection(section.id)}>
          <small aria-hidden="true">{String(index + 1).padStart(2, '0')}</small>
          {section.label}
        </button>
      ))}
    </nav>
  )
}

function FocusTrend({ rows, onSelect }) {
  const plotted = rows.filter(row => row.scoreEligible)
  const scoreableCount = plotted.length
  if (scoreableCount === 0) return <p className="analytics-details-empty">No sessions with at least 10 minutes of reliable measurement match these filters.</p>

  const timestamps = rows.map(row => row.timestamp).filter(Number.isFinite)
  const firstTimestamp = Math.min(...timestamps)
  const lastTimestamp = Math.max(...timestamps)
  const x = timestamp => firstTimestamp === lastTimestamp
    ? 510
    : 58 + ((timestamp - firstTimestamp) / (lastTimestamp - firstTimestamp)) * 918
  const y = value => 200 - value * 1.72
  const series = new Map()
  plotted.forEach(row => {
    if (!series.has(row.generation)) series.set(row.generation, [])
    series.get(row.generation).push(row)
  })
  const hasEarlierGeneration = plotted.some(row => !row.currentGeneration)
  const generationBreaks = plotted.flatMap((row, index) => {
    if (index === 0 || row.generation === plotted[index - 1].generation) return []
    return [(x(plotted[index - 1].timestamp) + x(row.timestamp)) / 2]
  })
  const dateTicks = firstTimestamp === lastTimestamp
    ? [firstTimestamp]
    : [firstTimestamp, firstTimestamp + (lastTimestamp - firstTimestamp) / 2, lastTimestamp]

  return (
    <>
      <div className="analytics-focus-legend">
        <span><i className="is-current" />Current measurement</span>
        {hasEarlierGeneration && <span><i className="is-earlier" />Earlier measurement</span>}
        <span className="analytics-focus-legend-axis">Average attention / 100 · chronological</span>
      </div>
      <svg className="analytics-main-plot" viewBox="0 0 1000 238" role="group" aria-label={`Average attention across ${sessionLabel(scoreableCount)} with at least 10 minutes of reliable measurement`}>
        {[25, 50, 75, 100].map(value => (
          <g key={value}>
            <line x1="56" x2="976" y1={y(value)} y2={y(value)} />
            <text x="42" y={y(value) + 4} textAnchor="end">{value}</text>
          </g>
        ))}
        {[...series.entries()].map(([generation, items]) => (
          <path
            key={generation}
            className={items[0]?.currentGeneration ? 'is-current-generation' : 'is-earlier-generation'}
            d={items.map((item, pointIndex) => `${pointIndex ? 'L' : 'M'} ${x(item.timestamp)} ${y(item.averageAttention)}`).join(' ')}
          />
        ))}
        {generationBreaks.map(position => (
          <g key={position} className="analytics-generation-break" role="img" aria-label="Measurement method changed; the two score series are not connected">
            <line x1={position} x2={position} y1="20" y2="202" />
            <text x={position + 7} y="28">METHOD CHANGE</text>
          </g>
        ))}
        {plotted.map(point => (
          <FocusPoint key={point.id} point={point} cx={x(point.timestamp)} cy={y(point.averageAttention)} onSelect={onSelect} />
        ))}
        {dateTicks.map((timestamp, index) => (
          <text key={timestamp} x={x(timestamp)} y="230" textAnchor={index === 0 ? 'start' : index === dateTicks.length - 1 ? 'end' : 'middle'}>{fmtDate(timestamp)}</text>
        ))}
      </svg>
    </>
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

function TimeOfDay({ data, usableCount, required }) {
  const bestId = data.comparison.best?.id
  const worstId = data.comparison.worst?.id
  const populatedPeriods = data.rows.filter(row => row.averageAttention != null).length
  const collectingMessage = usableCount < required
    ? `Collecting qualified sessions: ${usableCount}/${required}. A time period shows attention after 3 sessions.`
    : populatedPeriods < 2
      ? 'A comparison needs two time periods with at least 3 qualified sessions each.'
      : null
  return (
    <>
      <ConditionSignal comparison={data.comparison} />
      {collectingMessage && <p className="analytics-time-status">{collectingMessage}</p>}
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

function DurationPoint({ sessions, cx, cy, onSelect }) {
  const latest = sessions.at(-1)
  const count = sessions.length
  const description = count === 1
    ? pointDescription(latest)
    : `${count} sessions at ${formatMinutes(latest.durationMinutes)} active time and ${latest.averageAttention} average attention; dates ${sessions.map(session => fmtDate(session.timestamp)).join(', ')}`
  const activate = event => {
    if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return
    event?.preventDefault()
    onSelect(latest.id)
  }
  return (
    <g
      className={`analytics-duration-point${count > 1 ? ' has-count' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${description}. Open ${count > 1 ? 'the most recent' : 'session'} details.`}
      onClick={activate}
      onKeyDown={activate}
    >
      <circle className="analytics-point-hit" cx={cx} cy={cy} r="16" />
      <circle className="analytics-duration-point-mark" cx={cx} cy={cy} r="5" />
      {count > 1 && <text x={cx + 10} y={cy - 9}>×{count}</text>}
      <title>{description}</title>
    </g>
  )
}

function DurationPlot({ rows, analysis, onSelect }) {
  const axisMin = 10
  const observedMax = Math.max(axisMin, ...rows.map(row => row.durationMinutes))
  const tickStep = observedMax > 180 ? 60 : observedMax > 90 ? 30 : 20
  const axisMax = Math.max(30, Math.ceil(observedMax / 15) * 15 + (observedMax > 90 ? 15 : 0))
  const lowestAttention = Math.min(...rows.map(row => row.averageAttention))
  const attentionMin = Math.max(0, Math.floor((lowestAttention - 10) / 25) * 25)
  const attentionTicks = Array.from({ length: Math.floor((100 - attentionMin) / 25) + 1 }, (_, index) => attentionMin + index * 25)
  const x = value => 58 + ((value - axisMin) / (axisMax - axisMin)) * 918
  const y = value => 154 - ((value - attentionMin) / (100 - attentionMin)) * 128
  const durationTicks = [...new Set([
    axisMin,
    ...Array.from({ length: Math.floor(axisMax / tickStep) }, (_, index) => (index + 1) * tickStep),
  ])].filter(value => value >= axisMin && value < axisMax).sort((a, b) => a - b)
  const grouped = new Map()
  for (const row of rows) {
    const key = `${row.durationMinutes}:${row.averageAttention}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }
  const clusters = [...grouped.values()]
  const medianReady = analysis.count >= 3
  const trend = analysis.trend
  const signedTrend = trend == null
    ? null
    : `${trend.pointsPer30Minutes > 0 ? '+' : ''}${trend.pointsPer30Minutes}`
  return (
    <>
      <div className="analytics-duration-readout">
        <span>{sessionLabel(rows.length)}</span>
        <span>Median <strong>{formatMinutes(analysis.medianDurationMinutes)} · {analysis.medianAttention}/100</strong></span>
        {trend ? <span>Trend <strong>{signedTrend} points / 30 min</strong> <em>association only</em></span> : <span>Trend needs 8 varied sessions</span>}
      </div>
      <svg className="analytics-secondary-plot analytics-duration-plot" viewBox="0 0 1000 202" role="group" aria-label={`Focus time and average attention across ${sessionLabel(rows.length)}`}>
        {attentionTicks.map(value => (
          <g key={value}>
            <line x1="58" x2="976" y1={y(value)} y2={y(value)} />
            <text x="42" y={y(value) + 4} textAnchor="end">{value}</text>
          </g>
        ))}
        {medianReady && (
          <g className="analytics-duration-reference" aria-label={`Median focus time: ${formatMinutes(analysis.medianDurationMinutes)}`}>
            <line x1={x(analysis.medianDurationMinutes)} x2={x(analysis.medianDurationMinutes)} y1="26" y2="154" />
          </g>
        )}
        {trend && (
          <line
            className="analytics-duration-trend"
            x1={x(trend.minDuration)}
            x2={x(trend.maxDuration)}
            y1={y(trend.startAttention)}
            y2={y(trend.endAttention)}
          />
        )}
        {clusters.map(sessions => (
          <DurationPoint
            key={`${sessions[0].durationMinutes}:${sessions[0].averageAttention}`}
            sessions={sessions}
            cx={x(sessions[0].durationMinutes)}
            cy={y(sessions[0].averageAttention)}
            onSelect={onSelect}
          />
        ))}
        {durationTicks.map(value => <text key={value} x={x(value)} y="188" textAnchor={value === axisMin ? 'start' : 'middle'}>{value}m</text>)}
      </svg>
    </>
  )
}

function PhaseShare({ phases }) {
  const deepFocus = phases.deepFocus
  const missingDeepFocusSessions = deepFocus.measuredSessions - deepFocus.trackedSessions
  return (
    <div className="analytics-phase-summary">
      {phases.rows.length > 0 && (
        <>
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
        </>
      )}
      <div className={`analytics-deep-focus${deepFocus.complete ? '' : ' is-unavailable'}`} aria-label="Exact Deep Focus time">
        <div>
          <span>Deep Focus</span>
          <small>Exact Flow time</small>
        </div>
        <strong>{deepFocus.complete ? formatDuration(deepFocus.seconds) : 'Unavailable'}</strong>
        <p>
          {deepFocus.complete
            ? `Recorded across ${sessionLabel(deepFocus.trackedSessions)}. This time overlaps the attention phases above.`
            : deepFocus.measuredSessions > 0
              ? `Exact Flow time is missing from ${sessionLabel(missingDeepFocusSessions)} in this selection, so no partial total is shown.`
              : 'No qualified session in this selection has exact Flow time.'}
        </p>
      </div>
    </div>
  )
}

export default function DataExplorer({ sessions, selectedSessionId, onSelectSession, onUpdateSession }) {
  const [range, setRange] = useState('all')
  const [outcome, setOutcome] = useState('all')
  const [workspace, setWorkspace] = useState('all')

  const comparable = useMemo(() => knownMeasurementSessions(sessions), [sessions])
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
  const workspaceReady = details.conditions.usableCount >= details.conditions.required &&
    details.conditions.workspace.rows.filter(row => row.averageAttention != null).length >= 2
  const durationReady = details.duration.length >= 3
  const phasesReady = details.phases.totalSeconds > 0 || details.phases.deepFocus.measuredSessions > 0
  const plottedSessionCount = details.timeline.filter(row => row.scoreEligible).length
  const excludedSessionCount = details.sessionCount - plottedSessionCount
  const indexSections = [
    { id: 'focus-trend-heading', label: 'Sessions' },
    { id: 'conditions-heading', label: 'Conditions' },
    ...(durationReady || phasesReady ? [{ id: 'rhythm-heading', label: 'Rhythm' }] : []),
  ]

  return (
    <div className="analytics-explorer analytics-details">
      <div className="analytics-details-filters">
        <div className="analytics-range-control">
          <span>Range</span>
          <div className="analytics-range-switch" aria-label="Date range">
            {RANGE_OPTIONS.map(option => (
              <button key={option.value} type="button" className={range === option.value ? 'is-active' : ''} aria-pressed={range === option.value} onClick={() => setRange(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
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
          <DetailsIndex sections={indexSections} />
          <section className="analytics-details-section analytics-details-hero" aria-labelledby="focus-trend-heading">
            <SectionHeading
              kicker="Development"
              title="Focus by session"
              description="Only sessions with at least 10 minutes of reliable measurement are plotted. Earlier measurement methods remain a separate series; excluded sessions stay in history without crowding the chart."
              id="focus-trend-heading"
              meta={`${plottedSessionCount} plotted · ${excludedSessionCount} excluded`}
            />
            <FocusTrend rows={details.timeline} onSelect={onSelectSession} />
          </section>

          <section className="analytics-details-section" aria-labelledby="conditions-heading">
            <SectionHeading
              kicker="Conditions"
              title="Where and when focus is strongest"
              description="Sessions are placed by their recorded start time. A period gets an attention average after 3 qualified sessions; comparisons wait for 8 total and two populated periods."
              id="conditions-heading"
              meta={details.conditions.usableCount < details.conditions.required
                ? `Collecting ${details.conditions.usableCount}/${details.conditions.required}`
                : `${details.conditions.usableCount} qualified sessions`}
            />
            <div className={`analytics-condition-grid${workspaceReady ? '' : ' is-single'}`}>
              <div>
                <h3>Time of day</h3>
                <TimeOfDay
                  data={details.conditions.timeOfDay}
                  usableCount={details.conditions.usableCount}
                  required={details.conditions.required}
                />
              </div>
              {workspaceReady && (
                <div>
                  <h3>Workspace</h3>
                  <WorkspaceComparison data={details.conditions.workspace} />
                </div>
              )}
            </div>
          </section>

          {(durationReady || phasesReady) && (
            <section className="analytics-details-section" aria-labelledby="rhythm-heading">
              <SectionHeading
                kicker="Work rhythm"
                title="How your sessions behave"
                description="Compare focus time with measured attention and inspect how measured time divides into attention phases."
                id="rhythm-heading"
              />
              <div className="analytics-rhythm-grid">
                {durationReady && (
                  <div>
                    <h3>Focus time vs attention</h3>
                    <DurationPlot rows={details.duration} analysis={details.durationAnalysis} onSelect={onSelectSession} />
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

        </>
      )}
    </div>
  )
}
