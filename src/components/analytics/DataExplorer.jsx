import { useEffect, useMemo, useState } from 'react'
import {
  buildDetailsHeadline,
  buildDetailsSummary,
  filterDetailsSessions,
  knownMeasurementSessions,
} from '../../lib/analyticsModel'
import { useReveal } from './chart/hooks'
import DurationPlot from './details/DurationPlot'
import FocusClock from './details/FocusClock'
import FocusTrend, { DetailsHeadline } from './details/FocusTrend'
import PhaseDonut from './details/PhaseDonut'
import { sessionLabel } from './details/format'
import SessionDetailView from './sessions/SessionDetailView'
import DsSelect from '../DsSelect'

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

/** A card that fades up the first time it scrolls into view and only then starts its chart animations. */
function RevealSection({ className = '', labelledBy, children }) {
  const [ref, revealed] = useReveal()
  return (
    <section ref={ref} className={`analytics-details-section ${className}${revealed ? ' is-revealed' : ''}`} aria-labelledby={labelledBy}>
      {children}
    </section>
  )
}

/**
 * Section chips with a scroll-spy: the chip for the card currently in the
 * reading band is marked, so the sticky toolbar always says where you are.
 */
function DetailsIndex({ sections }) {
  const [activeId, setActiveId] = useState(sections[0]?.id)
  const ids = sections.map(section => section.id).join('|')
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return undefined
    const targets = ids.split('|').map(id => document.getElementById(id)?.closest('section')).filter(Boolean)
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting)
      if (visible.length) setActiveId(visible[0].target.getAttribute('aria-labelledby'))
    }, { rootMargin: '-35% 0px -55% 0px' })
    targets.forEach(target => observer.observe(target))
    return () => observer.disconnect()
  }, [ids])
  const openSection = id => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setActiveId(id)
    document.getElementById(id)?.closest('section')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }
  return (
    <nav className="analytics-details-index" aria-label="Details sections">
      {sections.map(section => (
        <button
          key={section.id}
          type="button"
          className={activeId === section.id ? 'is-active' : undefined}
          aria-current={activeId === section.id ? 'location' : undefined}
          onClick={() => openSection(section.id)}
        >
          {section.label}
        </button>
      ))}
    </nav>
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
      <FocusClock rows={data.rows} comparison={data.comparison} usableCount={usableCount} required={required} />
    </>
  )
}

function WorkspaceComparison({ data }) {
  const rows = data.rows.filter(row => row.averageAttention != null)
  const bestId = data.comparison.best?.id
  const worstId = data.comparison.worst?.id
  return (
    <>
      <ConditionSignal comparison={data.comparison} />
      <div className="analytics-workspace-list">
        {rows.map((row, index) => (
          <div key={row.id} style={{ '--i': index }} className={`${row.id === bestId ? 'is-best' : ''} ${row.id === worstId ? 'is-worst' : ''}`.trim() || undefined}>
            <div>
              <span>{row.label}</span>
              <small>{sessionLabel(row.sessions)}{row.outcomeRate == null ? '' : ` · ${row.outcomeRate}% goals reached`}</small>
            </div>
            <strong>{row.averageAttention}</strong>
            <i><b style={{ width: `${row.averageAttention}%` }} /></i>
          </div>
        ))}
      </div>
    </>
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
  const headline = useMemo(() => buildDetailsHeadline(filtered), [filtered])
  const filterKey = `${range}|${outcome}|${workspace}`
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
      <div className="analytics-toolbar">
        <div className="analytics-details-filters">
          <div
            className="analytics-range-switch"
            role="group"
            aria-label="Date range"
            style={{ '--range-index': Math.max(0, RANGE_OPTIONS.findIndex(option => option.value === range)) }}
          >
            <span className="analytics-range-thumb" aria-hidden="true" />
            {RANGE_OPTIONS.map(option => (
              <button key={option.value} type="button" className={range === option.value ? 'is-active' : ''} aria-pressed={range === option.value} onClick={() => setRange(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
          <DsSelect
            className={`ds-select-pill${outcome !== 'all' ? ' is-set' : ''}`}
            label="Outcome"
            prefix="Outcome"
            value={outcome}
            options={OUTCOME_OPTIONS.map(([value, label]) => ({ value, label }))}
            onChange={setOutcome}
          />
          <DsSelect
            className={`ds-select-pill${workspace !== 'all' ? ' is-set' : ''}`}
            label="Workspace"
            prefix="Workspace"
            value={workspace}
            options={[{ value: 'all', label: 'All workspaces' }, ...workspaces.map(([id, name]) => ({ value: id, label: name }))]}
            onChange={setWorkspace}
          />
          {resetVisible && <button type="button" className="analytics-filter-reset" onClick={() => { setRange('all'); setOutcome('all'); setWorkspace('all') }}>Reset</button>}
          <div className="analytics-filter-count">
            <strong>{details.sessionCount}</strong>
            <span>{details.sessionCount === 1 ? 'session' : 'sessions'} · {details.measuredCount} measured</span>
          </div>
        </div>
        {details.sessionCount > 0 && <DetailsIndex key={indexSections.map(section => section.id).join('|')} sections={indexSections} />}
      </div>

      {details.sessionCount === 0 ? (
        <div className="analytics-details-zero">
          <strong>No sessions match these filters.</strong>
          <p>Reset the filters to return to your complete comparable history.</p>
        </div>
      ) : (
        <>
          <RevealSection className="analytics-details-hero" labelledBy="focus-trend-heading">
            <SectionHeading
              kicker="Development"
              title="Focus by session"
              description="Only sessions with at least 10 minutes of reliable measurement are plotted. Earlier measurement methods remain a separate series; excluded sessions stay in history without crowding the chart."
              id="focus-trend-heading"
              meta={excludedSessionCount > 0 ? `${plottedSessionCount} shown · ${excludedSessionCount} too short to plot` : `${plottedSessionCount} sessions shown`}
            />
            <DetailsHeadline headline={headline} />
            <FocusTrend key={`trend-${filterKey}`} rows={details.timeline} onSelect={onSelectSession} />
          </RevealSection>

          {!details.chartsOnCurrentMethod && (
            <p className="analytics-footnote analytics-method-note" role="note">
              The charts below still use your earlier measurement method
              {details.chartsMethodLastTimestamp ? ` (sessions up to ${new Date(details.chartsMethodLastTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''}.
              They switch to the current method once it has {details.conditions.required} qualified sessions
              ({details.currentMethodQualified} so far). The two are never mixed.
            </p>
          )}

          <RevealSection labelledBy="conditions-heading">
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
                  key={`time-${filterKey}`}
                  data={details.conditions.timeOfDay}
                  usableCount={details.conditions.usableCount}
                  required={details.conditions.required}
                />
              </div>
              {workspaceReady && (
                <div>
                  <h3>Workspace</h3>
                  <WorkspaceComparison key={`workspace-${filterKey}`} data={details.conditions.workspace} />
                </div>
              )}
            </div>
          </RevealSection>

          {(durationReady || phasesReady) && (
            <RevealSection labelledBy="rhythm-heading">
              <SectionHeading
                kicker="Work rhythm"
                title="How your sessions behave"
                description="Compare session time with measured attention and inspect how measured time divides into attention phases."
                id="rhythm-heading"
              />
              <div className="analytics-rhythm-grid">
                {durationReady && (
                  <div>
                    <h3>Session time vs attention</h3>
                    <DurationPlot key={`duration-${filterKey}`} rows={details.duration} analysis={details.durationAnalysis} onSelect={onSelectSession} />
                  </div>
                )}
                {phasesReady && (
                  <div>
                    <h3>How your focus moved</h3>
                    <p>{sessionLabel(details.phases.tracedSessions)} with phase data</p>
                    <PhaseDonut key={`phases-${filterKey}`} phases={details.phases} />
                  </div>
                )}
              </div>
            </RevealSection>
          )}

        </>
      )}
    </div>
  )
}
