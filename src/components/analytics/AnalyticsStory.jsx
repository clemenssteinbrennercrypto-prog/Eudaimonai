import { useMemo, useState } from 'react'
import { buildAnalyticsStory, buildOverviewSnapshot } from '../../lib/analyticsModel'
import { fmtDuration } from '../../lib/sessionAnalysisPresentation'
import { useCountUp } from './chart/hooks'
import Sessions from './Sessions'

const OUTCOMES = [
  { value: 'yes', label: 'Reached', className: 'is-good' },
  { value: 'partly', label: 'Partly', className: 'is-warn' },
  { value: 'no', label: 'Missed', className: 'is-bad' },
]

function fmtDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function OutcomeInbox({ sessions, onRate }) {
  if (sessions.length === 0) return null
  const visible = sessions.slice(0, 3)
  return (
    <section className="analytics-inbox" aria-labelledby="outcome-inbox-heading">
      <div className="analytics-section-heading">
        <div>
          <span className="analytics-kicker">Missing outcomes</span>
          <h2 id="outcome-inbox-heading">How did these sessions go?</h2>
        </div>
        <b>{sessions.length} open</b>
      </div>
      <p className="analytics-copy">Add the result so Analytics can connect measured attention with whether the work actually got done.</p>
      <div className="analytics-inbox-list">
        {visible.map(session => (
          <div className="analytics-inbox-row" key={session.id}>
            <div>
              <strong>{session.goal || session.task || 'Untitled session'}</strong>
              <span>{fmtDate(session.timestamp)} · {fmtDuration(session.actualSeconds)} active</span>
            </div>
            <div className="analytics-outcome-actions" aria-label={`Rate ${session.task || 'session'}`}>
              {OUTCOMES.map(outcome => (
                <button
                  key={outcome.value}
                  type="button"
                  className={outcome.className}
                  onClick={() => onRate(session.id, {
                    goalOutcome: outcome.value,
                    goalAchieved: outcome.value === 'yes' ? true : outcome.value === 'no' ? false : null,
                  })}
                >
                  {outcome.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {sessions.length > visible.length && (
        <p className="analytics-footnote">{sessions.length - visible.length} more unrated sessions remain in Session history.</p>
      )}
    </section>
  )
}

const OVERVIEW_RANGE_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'month', label: '30 days' },
  { value: 'week', label: '7 days' },
]

function CountedDuration({ seconds }) {
  const animated = useCountUp(seconds)
  return <>{seconds > 0 ? fmtDuration(Math.round(animated)) : '0m'}</>
}

function CountedNumber({ value }) {
  const animated = useCountUp(value)
  return <>{Math.round(animated)}</>
}

/** Attention out of 100 as a glowing ring; the ring is the value, never a target. */
function AttentionRing({ value }) {
  const animated = useCountUp(value ?? 0)
  return (
    <svg className="analytics-attention-ring" viewBox="0 0 84 84" aria-hidden="true">
      <circle className="analytics-attention-ring-track" cx="42" cy="42" r="34" />
      {value != null && (
        <circle
          className="analytics-attention-ring-value"
          cx="42"
          cy="42"
          r="34"
          pathLength="100"
          strokeDasharray={`${Math.max(0, Math.min(100, animated))} 100`}
          transform="rotate(-90 42 42)"
        />
      )}
    </svg>
  )
}

function RecentOverview({ sessions }) {
  const [range, setRange] = useState('month')
  const snapshot = useMemo(() => buildOverviewSnapshot(sessions, range), [sessions, range])
  const rangeIndex = Math.max(0, OVERVIEW_RANGE_OPTIONS.findIndex(option => option.value === range))

  return (
    <section className="analytics-panel analytics-overview" aria-labelledby="recent-overview-heading">
      <div className="analytics-section-heading">
        <div>
          <span className="analytics-kicker">Overview</span>
          <h2 id="recent-overview-heading">Focus at a glance</h2>
        </div>
        <div className="analytics-range-switch analytics-overview-range" role="group" aria-label="Overview range" style={{ '--range-index': rangeIndex }}>
          <span className="analytics-range-thumb" aria-hidden="true" />
          {OVERVIEW_RANGE_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={range === option.value ? 'is-active' : ''}
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="analytics-overview-grid">
        <div className="analytics-overview-metric is-time">
          <strong><CountedDuration seconds={snapshot.focusSeconds} /></strong>
          <span>Focus time</span>
        </div>
        <div className="analytics-overview-metric is-attention">
          <AttentionRing value={snapshot.averageAttention} />
          <div>
            <strong>
              {snapshot.averageAttention == null ? '—' : <><CountedNumber value={snapshot.averageAttention} />/100</>}
            </strong>
            <span>Average attention</span>
          </div>
        </div>
        <div className="analytics-overview-metric">
          <strong><CountedNumber value={snapshot.sessionCount} /></strong>
          <span>{snapshot.sessionCount === 1 ? 'Session' : 'Sessions'}</span>
        </div>
      </div>
    </section>
  )
}

export default function AnalyticsStory({
  sessions,
  focusLedger,
  selectedSessionId,
  onSelectSession,
  onDeleteSession,
  onClearAll,
  onUpdateSession,
}) {
  const story = useMemo(() => buildAnalyticsStory(sessions), [sessions])

  return (
    <div className="analytics-story">
      <RecentOverview sessions={sessions} />
      <OutcomeInbox sessions={story.unratedSessions} onRate={onUpdateSession} />
      <section className="analytics-history" aria-labelledby="session-history-heading">
        <div className="analytics-section-heading">
          <div>
            <span className="analytics-kicker">History</span>
            <h2 id="session-history-heading">Session history</h2>
          </div>
          <b>{sessions.length} total</b>
        </div>
        <Sessions
          compact
          sessions={sessions}
          focusLedger={focusLedger}
          selectedSessionId={selectedSessionId}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          onClearAll={onClearAll}
          onUpdateSession={onUpdateSession}
        />
      </section>
    </div>
  )
}
