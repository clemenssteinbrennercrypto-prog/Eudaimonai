import { useMemo, useState } from 'react'
import { loadFocusAppsConfig } from '../lib/storage'
import { emptyFocusLedger, getFocusPeriodWindow } from '../lib/focusMetric'
import { buildDashboardData } from '../lib/dashboardData'
import { useCompanionStatus } from '../lib/useCompanionStatus'
import { useCurrentTime } from '../lib/useCurrentTime'
import FocusScoreExplanation, { focusScoreLabel } from './FocusScoreExplanation'
import { formatDurationCompact } from '../lib/durationFormat'
import { FOCUS_SCORE } from '../lib/focusScore'

const PERIOD_RANGES = [['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']]

// SF Symbols-style glyphs: 1.5px stroke at 16px, round caps, currentColor.
function Chevron({ direction }) {
  return (
    <svg className="ds-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={direction === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} />
    </svg>
  )
}

function SegmentedControl({ items, value, onChange, label }) {
  return (
    <div
      className="lab-segments"
      role="group"
      aria-label={label}
      style={{ '--seg-count': items.length, '--seg-index': Math.max(0, items.findIndex(([id]) => id === value)) }}
    >
      <span className="lab-segments-thumb" aria-hidden="true" />
      {items.map(([id, text]) => (
        <button key={id} type="button" aria-pressed={value === id} className={value === id ? 'is-active' : ''} onClick={() => onChange(id)}>{text}</button>
      ))}
    </div>
  )
}

// The Focus Score inside three thin rings, one per component, outer to
// inner: Focus time against the score's own weekday reference, average
// attention out of 100, and Deep Focus as a share of measured time. Each arc
// is a measured fraction and nothing else; an unknown value draws no arc, so
// a gap can never pass for a value.
const RING_RADII = [55, 47, 39]
// Clean, flat 2D strokes in three clearly different metals: white, silver
// and dark silver. No gloss, shading or shadow on the rings (Clemens: the
// tube look was too 3D); the difference between the tones does the work.
const SILVER_TONES = [
  ['time', '#FFFFFF'],
  ['attention', '#B4BBC6'],
  ['deep', '#6B7280'],
]

function ScoreRings({ score, caption, rings }) {
  return (
    <div className={`lab-ring${score == null ? ' is-empty' : ''}`}>
      <svg viewBox="0 0 128 128" aria-hidden="true">
        {rings.map(({ key, fraction }, index) => {
          const radius = RING_RADII[index]
          const circumference = 2 * Math.PI * radius
          return (
            <g key={key} className={`lab-ring-${key}`}>
              <circle className="lab-ring-track" cx="64" cy="64" r={radius} />
              {fraction != null && fraction > 0 && (
                <circle
                  className="lab-ring-arc"
                  cx="64"
                  cy="64"
                  r={radius}
                  style={{
                    stroke: SILVER_TONES[index][1],
                    strokeDasharray: circumference,
                    '--ring-offset': circumference * (1 - Math.min(1, fraction)),
                    '--ring-circumference': circumference,
                    animationDelay: `${index * 80}ms`,
                  }}
                />
              )}
            </g>
          )
        })}
      </svg>
      <div className="lab-ring-center">
        <strong>{score ?? '—'}</strong>
        <span>{caption}</span>
      </div>
    </div>
  )
}

function fractionOf(value, whole) {
  return Number.isFinite(value) && Number.isFinite(whole) && whole > 0 && value >= 0 ? value / whole : null
}

function Metric({ label, value, suffix, detail, tone }) {
  return (
    <div className={`lab-metric lab-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value ?? '—'}{value != null && suffix ? <small>{suffix}</small> : null}</strong>
      {detail ? <small className="lab-metric-detail">{detail}</small> : null}
    </div>
  )
}

// Every other screen formats dates in en-US; the system locale here put
// German weekdays ("MO., 28.") between English labels.
const DATE_LOCALE = 'en-US'

function formatSessionTime(bin, range) {
  if (!Number.isFinite(bin?.sessionStartedAt) || !Number.isFinite(bin?.sessionEndedAt)) return ''
  const formatTime = timestamp => new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const time = `${formatTime(bin.sessionStartedAt)}–${formatTime(bin.sessionEndedAt)}`
  if (range === 'day') return time
  const date = new Date(bin.sessionStartedAt).toLocaleDateString(DATE_LOCALE, { day: '2-digit', month: 'short' })
  return `${date} · ${time}`
}

function AttentionField({ bins, range, title }) {
  const [hoveredBinIndex, setHoveredBinIndex] = useState(null)
  const start = bins[0]?.timestamp
  const interval = bins.length > 1 ? bins[1].timestamp - start : 0
  const end = bins.at(-1)?.timestamp + interval
  const tickCount = range === 'day' ? 5 : range === 'week' ? 8 : 6
  const formatTick = (timestamp, index) => {
    const date = new Date(timestamp)
    if (range === 'day') {
      if (index === tickCount - 1) return '24:00'
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    }
    if (range === 'week') {
      return date.toLocaleDateString(DATE_LOCALE, { weekday: 'short', day: '2-digit' })
    }
    return date.toLocaleDateString(DATE_LOCALE, { day: '2-digit', month: 'short' })
  }
  const ticks = Number.isFinite(start) && Number.isFinite(end)
    ? range === 'day'
      ? [0, 6, 12, 18, 24].map(hour => {
        const tick = new Date(start)
        tick.setHours(hour, 0, 0, 0)
        const timestamp = tick.getTime()
        return { position: (timestamp - start) / (end - start), timestamp }
      })
      : Array.from({ length: tickCount }, (_, index) => ({
        position: index / (tickCount - 1),
        timestamp: start + ((end - start) * index) / (tickCount - 1),
      }))
    : []
  const hoveredBin = hoveredBinIndex == null ? null : bins[hoveredBinIndex]
  const tooltipPosition = hoveredBin
    ? `${((hoveredBin.index + 0.5) / bins.length) * 100}%`
    : '50%'
  const sessionTime = formatSessionTime(hoveredBin, range)
  const followPointer = event => {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0) return
    const position = Math.min(0.999999, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const bin = bins[Math.floor(position * bins.length)]
    setHoveredBinIndex(current => current === bin?.index ? current : bin?.sessionName ? bin.index : null)
  }

  return (
    <div className="attention-timeline">
      <div
        className="attention-field-frame"
        onMouseMove={followPointer}
        onMouseLeave={() => setHoveredBinIndex(null)}
      >
        <div
          className={`attention-field${hoveredBin?.sessionName ? ' has-hover' : ''}`}
          role="img"
          aria-label={`Attention field for ${title}`}
        >
          {bins.map(bin => (
            <i
              key={bin.index}
              className={`attention-bin is-${bin.state}${hoveredBinIndex === bin.index ? ' is-hovered' : ''}`}
              style={{ '--attention-height': bin.score == null ? '18%' : `${Math.max(18, bin.score)}%` }}
              aria-label={bin.sessionName
                ? `${bin.sessionName} · ${bin.score == null ? bin.state : `Focus ${bin.score}`}`
                : bin.score == null ? bin.state : `Focus ${bin.score}`}
            />
          ))}
        </div>
        <div
          className={`attention-session-tooltip${hoveredBin?.sessionName ? ' is-visible' : ''}`}
          role="tooltip"
          style={{ '--attention-tooltip-x': tooltipPosition }}
        >
          <strong>{hoveredBin?.sessionName || ''}</strong>
          {sessionTime && <time>{sessionTime}</time>}
        </div>
      </div>
      <div className="attention-axis" aria-hidden="true">
        {ticks.map((tick, index) => (
          <span key={tick.timestamp} style={{ left: `${tick.position * 100}%` }}>
            {formatTick(tick.timestamp, index)}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function LabDashboard({ focusModeEnabled, sessions = [], ledger = null, onSession, onAnalytics }) {
  const [periodSelection, setPeriodSelection] = useState({ range: 'day', periodStart: null })
  const nativeStatus = useCompanionStatus()
  // Sessions and the ledger arrive as props — App owns loading them and
  // re-reads after every completed session, so this stays a pure render of
  // whatever it is handed. focusConfig is a local settings key, not session
  // history, so it is still read directly.
  const source = useMemo(() => ({
    ledger: ledger || emptyFocusLedger(),
    sessions,
    focusConfig: loadFocusAppsConfig(),
  }), [ledger, sessions])
  const dashboardNow = useCurrentTime()
  const data = useMemo(() => buildDashboardData({
    ...source,
    focusModeEnabled,
    range: periodSelection.range,
    periodStart: periodSelection.periodStart,
    now: dashboardNow,
    nativeStatus,
    metricVersion: FOCUS_SCORE.metricVersion,
  }), [source, focusModeEnabled, periodSelection, dashboardNow, nativeStatus])
  const { period, time } = data
  const deepFocusDetail = time.deepFocusSeconds == null
    ? time.sessionCount > 0 ? 'Missing for some sessions' : 'No sessions in this period'
    : 'Stretches of 90 s or more of steady attention'
  const referenceMinutes = period.referenceMinutes ??
    (period.referenceWorkdays > 0 ? FOCUS_SCORE.referenceMinutesPerWorkday * period.referenceWorkdays : null)
  const rings = [
    { key: 'time', fraction: fractionOf(time.focusSeconds == null ? null : time.focusSeconds / 60, referenceMinutes) },
    { key: 'attention', fraction: fractionOf(period.averageAttention, 100) },
    { key: 'deep', fraction: fractionOf(time.deepFocusSeconds, time.measuredSeconds) },
  ]
  const hasAttentionSignal = data.attention.some(bin => !['inactive', 'no-signal', 'paused', 'future'].includes(bin.state))
  const selectRange = range => setPeriodSelection({ range, periodStart: null })
  const movePeriod = delta => setPeriodSelection(current => {
    const realNow = Date.now()
    const displayedWindow = getFocusPeriodWindow(
      current.range,
      0,
      new Date(current.periodStart ?? realNow)
    )
    if (delta < 0) {
      const previous = getFocusPeriodWindow(current.range, -1, displayedWindow.start)
      return { ...current, periodStart: previous.start.getTime() }
    }

    const liveWindow = getFocusPeriodWindow(current.range, 0, new Date(realNow))
    const nextStart = displayedWindow.endExclusive.getTime()
    if (nextStart >= liveWindow.start.getTime()) {
      return { ...current, periodStart: null }
    }
    return { ...current, periodStart: nextStart }
  })

  return (
    <main className="lab-dashboard">
      <header className="ds-toolbar lab-toolbar" aria-label="Dashboard time period" data-tauri-drag-region>
        <h1>Lab</h1>
        <div className="lab-period-navigation">
          <button type="button" onClick={() => movePeriod(-1)} aria-label={`Show previous ${periodSelection.range}`}><Chevron direction="left" /></button>
          <strong aria-live="polite">{period.title}</strong>
          <button type="button" onClick={() => period.canGoForward && movePeriod(1)} aria-disabled={!period.canGoForward} aria-label={`Show next ${periodSelection.range}`}><Chevron direction="right" /></button>
        </div>
        <div className="ds-toolbar-actions">
          <SegmentedControl items={PERIOD_RANGES} value={periodSelection.range} onChange={selectRange} label="Dashboard range" />
          <button className="ds-button-primary lab-start" type="button" onClick={onSession} aria-label="Open session setup" title="New session (⌘N)">Start session</button>
        </div>
      </header>

      <section className="lab-panel lab-hero" aria-labelledby="lab-title">
        <h2 id="lab-title">Focus Score</h2>
        <ScoreRings score={period.score} caption={period.score == null ? focusScoreLabel(period) : 'of 100'} rings={rings} />
        <div className="lab-metric-row">
          <Metric
            tone="time"
            label="Focus time"
            value={time.focusSeconds == null ? null : formatDurationCompact(time.focusSeconds)}
            detail="Time in sessions, without breaks"
          />
          <Metric
            tone="attention"
            label="Average attention"
            value={period.averageAttention == null ? null : Math.round(period.averageAttention)}
            suffix="/100"
            detail="Average while the camera could see you"
          />
          <Metric
            tone="deep"
            label="Deep Focus"
            value={time.deepFocusSeconds == null ? null : formatDurationCompact(time.deepFocusSeconds)}
            detail={deepFocusDetail}
          />
        </div>
      </section>

      <FocusScoreExplanation period={period} time={time} warningsOnly />

      <section className="lab-panel lab-attention-section">
        <div className="lab-panel-head">
          <h2>Attention</h2>
          <span>{period.title}</span>
        </div>
        <AttentionField bins={data.attention} range={periodSelection.range} title={period.title} />
        {!hasAttentionSignal && <p className="attention-empty">Your attention shows up here after your first session.</p>}
        <div className="attention-legend">
          <span className="is-strong">High attention</span><span className="is-focused">Focused</span><span className="is-drift">Low attention</span><span className="is-paused">Break</span><span className="is-no-signal">Not measured</span>
        </div>
      </section>

        <div className="lab-panel lab-recent">
          <div className="lab-panel-head">
            <h2>Recent sessions</h2>
            <button type="button" className="lab-text-action" onClick={onAnalytics}>All sessions<Chevron direction="right" /></button>
          </div>
          {data.recentSessions.length === 0 ? (
            <p className="lab-empty-copy">Your completed sessions will appear here.</p>
          ) : (
            <div className="lab-session-list">
              {data.recentSessions.map(session => (
                <div className="lab-session-row" key={session.id}>
                  <strong>{session.task}</strong>
                  <span>{formatDurationCompact(session.durationSeconds)}</span>
                  <span>{session.efficiency == null ? 'Not measured' : `Attention ${Math.round(session.efficiency)}`}</span>
                  {/* "Unset" is the absence of an outcome, not an outcome. */}
                  <em className={`is-${session.outcome.toLowerCase()}`}>{session.outcome === 'Unset' ? '' : session.outcome}</em>
                </div>
              ))}
            </div>
          )}
        </div>
    </main>
  )
}
