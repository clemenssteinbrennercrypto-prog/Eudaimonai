import CheckIn from '../../sessionReport/CheckIn'
import TimelineBar from '../../sessionReport/TimelineBar'
import AttentionCurve from './AttentionCurve'
import { attentionTimelineBand, sampledAttentionBandSeconds } from '../../../lib/attentionTimeline'
import { fmtDuration } from '../../../lib/sessionAnalysisPresentation'
import { sessionEndedAt, sessionPausedSeconds, sessionStartedAt } from '../../../lib/sessionTiming'

const TIME_COLORS = {
  deep: 'var(--ds-attn-deep)',
  high: 'var(--ds-attn-high)',
  focused: 'var(--ds-attn-focused)',
  low: 'var(--ds-attn-low)',
  unmeasured: 'var(--ds-attn-none)',
  break: 'var(--line-strong)',
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export function buildAttentionTimes(session, measurement) {
  const activeSeconds = Math.max(0, measurement.actualSeconds || 0)
  const measuredSeconds = clamp(measurement.measuredSeconds, 0, activeSeconds)
  const focusedTotal = clamp(measurement.focusedSeconds, 0, measuredSeconds)
  const deepKnown = measurement.deepFocusSeconds != null
  const deepSeconds = deepKnown ? clamp(measurement.deepFocusSeconds, 0, focusedTotal) : 0
  const sampled = sampledAttentionBandSeconds(session?.timeline)
  const sampledHighSeconds = sampled.high + (deepKnown ? 0 : sampled.deep)
  const highSeconds = clamp(sampledHighSeconds, 0, focusedTotal - deepSeconds)
  const breakSeconds = Math.max(0, sessionPausedSeconds(session) || 0)

  return [
    ...(deepKnown ? [{ id: 'deep', label: 'Deep Focus', seconds: deepSeconds }] : []),
    { id: 'high', label: 'High attention', seconds: highSeconds },
    { id: 'focused', label: 'Focused', seconds: focusedTotal - deepSeconds - highSeconds },
    { id: 'low', label: 'Low attention', seconds: measuredSeconds - focusedTotal },
    { id: 'unmeasured', label: 'Not measured', seconds: activeSeconds - measuredSeconds },
    { id: 'break', label: 'Break', seconds: breakSeconds },
  ].filter(item => item.seconds > 0 || (item.id === 'deep' && deepKnown))
}

function fmtDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function fmtTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function resultLabel(outcome) {
  if (outcome === 'yes') return 'Reached'
  if (outcome === 'partly') return 'Partly'
  if (outcome === 'no') return 'Missed'
  return 'Not rated'
}

function attentionTone(score) {
  const band = attentionTimelineBand({ score }).id
  if (band === 'high' || band === 'deep') return 'is-good'
  if (band === 'focused') return 'is-warn'
  if (band === 'low') return 'is-bad'
  return 'is-muted'
}

function outcomeTone(outcome) {
  if (outcome === 'yes') return 'is-good'
  if (outcome === 'partly') return 'is-warn'
  if (outcome === 'no') return 'is-bad'
  return 'is-muted'
}

function AttentionTime({ session, entries }) {
  const total = entries.reduce((sum, entry) => sum + entry.seconds, 0)
  const hasTimeline = Array.isArray(session?.timeline) && session.timeline.length > 0

  return (
    <section className="session-overview-time" aria-labelledby="session-attention-time-heading">
      <div className="session-overview-section-heading">
        <div>
          <span className="analytics-kicker">Attention timeline</span>
          <h3 id="session-attention-time-heading">How attention changed through the session</h3>
        </div>
        <b>{hasTimeline ? 'In session order' : 'Duration summary'}</b>
      </div>
      {total > 0 ? (
        <>
          {hasTimeline ? (
            <>
              <AttentionCurve session={session} />
              <div className="session-overview-timeline" aria-label="Attention states in session order">
                <TimelineBar timeline={session.timeline} session={session} height={18} showPhases={false} />
              </div>
            </>
          ) : (
            <div className="session-overview-timebar" aria-label="Session time by measured attention state">
              {entries.filter(entry => entry.seconds > 0).map(entry => (
                <span
                  key={entry.id}
                  style={{ flex: entry.seconds, background: TIME_COLORS[entry.id] }}
                  title={`${entry.label}: ${fmtDuration(entry.seconds)}`}
                />
              ))}
            </div>
          )}
          <div className="session-overview-legend">
            {entries.map(entry => (
              <div key={entry.id}>
                <i style={{ background: TIME_COLORS[entry.id] }} aria-hidden="true" />
                <span>{entry.label}</span>
                <strong>{fmtDuration(entry.seconds)}</strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="analytics-copy">No duration data was stored for this session.</p>
      )}
    </section>
  )
}

export default function SessionOverview({ session, analysis, onUpdateSession }) {
  const { measurement, facts } = analysis
  const startedAt = sessionStartedAt(session)
  const endedAt = sessionEndedAt(session)
  const pausedSeconds = sessionPausedSeconds(session)
  const entries = buildAttentionTimes(session, measurement)
  const title = facts.intent.goal || facts.intent.task || 'Untitled session'
  const dateTimestamp = startedAt ?? session.timestamp

  return (
    <div className="session-overview">
      <section className="session-overview-hero">
        <p className="session-overview-date">
          {Number.isFinite(dateTimestamp) ? fmtDate(dateTimestamp) : 'Saved session'}
          {startedAt != null && endedAt != null ? ` · ${fmtTime(startedAt)}–${fmtTime(endedAt)}` : ''}
          {facts.workspace?.name ? ` · ${facts.workspace.name}` : ''}
        </p>
        <h2>{title}</h2>
      </section>

      <section className="session-overview-stats" aria-label="Session overview">
        <div>
          <span>Active time</span>
          <strong>{fmtDuration(measurement.actualSeconds)}</strong>
          {pausedSeconds > 0 && <small>{fmtDuration(pausedSeconds)} break</small>}
        </div>
        <div className={attentionTone(measurement.averageFocus)}>
          <span>Average attention</span>
          <strong>{measurement.averageFocus == null ? '—' : `${measurement.averageFocus}/100`}</strong>
          <small>{measurement.measuredSeconds == null ? 'Not measured' : `${fmtDuration(measurement.measuredSeconds)} measured`}</small>
        </div>
        <div>
          <span>Focused time</span>
          <strong>{measurement.focusedSeconds == null ? '—' : fmtDuration(measurement.focusedSeconds)}</strong>
          <small>Score 40 or higher</small>
        </div>
        <div className={outcomeTone(analysis.goalOutcome)}>
          <span>Goal</span>
          <strong>{resultLabel(analysis.goalOutcome)}</strong>
          <small>{facts.drift.alertCount} {facts.drift.alertCount === 1 ? 'alert' : 'alerts'}</small>
        </div>
      </section>

      <AttentionTime session={session} entries={entries} />

      <CheckIn
        session={session}
        analysis={analysis}
        onOutcomeChange={onUpdateSession}
      />
    </div>
  )
}
