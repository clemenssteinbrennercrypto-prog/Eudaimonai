import { useEffect, useMemo, useRef, useState } from 'react'
import { loadFocusAppsConfig } from '../lib/storage'
import { emptyFocusLedger, getFocusPeriodWindow } from '../lib/focusMetric'
import { buildDashboardData } from '../lib/dashboardData'
import { useCompanionStatus } from '../lib/useCompanionStatus'
import { useCurrentTime } from '../lib/useCurrentTime'
import FocusScoreExplanation, { FocusScoreMethod, focusScoreLabel } from './FocusScoreExplanation'
import { formatDurationCompact } from '../lib/durationFormat'
import { FOCUS_SCORE } from '../lib/focusScore'
import { buildDayBaseline, buildDayBaselineProgress } from '../lib/personalBaseline'
import { buildWeekReview, lastCompletedWeekStart } from '../lib/weeklyReview'
import WeekReview from './WeekReview'

// Which finished week's review the user has opened, so the Lab offers it once.
const WEEK_REVIEW_SEEN_KEY = 'eudaimonai_week_review_seen'
function readSeenWeek() {
  try { return localStorage.getItem(WEEK_REVIEW_SEEN_KEY) } catch { return null }
}
function writeSeenWeek(weekKey) {
  try { localStorage.setItem(WEEK_REVIEW_SEEN_KEY, weekKey) } catch { /* offered again next time */ }
}

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

function InfoPopover({ id, label, compact = false, children }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const Root = compact ? 'span' : 'div'
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = event => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    const onKeyDown = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
  return (
    <Root ref={rootRef} className={`lab-score-info${compact ? ' lab-metric-info' : ''}`}>
      <button
        type="button"
        className="lab-score-info-button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        onClick={() => setOpen(current => !current)}
      >
        <svg className="ds-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" /><path d="M8 7.25v4M8 4.9v.1" /></svg>
      </button>
      {open && (compact ? (
        <span id={id} className="lab-score-method lab-metric-info-popover" role="dialog" aria-label={label}>
          {children}
        </span>
      ) : (
        <div id={id} className={`lab-score-method${compact ? ' lab-metric-info-popover' : ''}`} role="dialog" aria-label={label}>
          {typeof children === 'string' ? <p>{children}</p> : children}
        </div>
      ))}
    </Root>
  )
}

function Metric({ label, value, suffix, detail, status = null, tone, compare = null }) {
  return (
    <div className={`lab-metric lab-metric-${tone}${compare ? ' has-compare' : ''}`}>
      <span>
        {label}
        {detail && <InfoPopover id={`lab-${tone}-metric-info`} label={`What ${label} means`} compact>{detail}</InfoPopover>}
      </span>
      <strong>{value ?? '—'}{value != null && suffix ? <small>{suffix}</small> : null}</strong>
      {status ? <small className="lab-metric-detail">{status}</small> : null}
      {compare}
    </div>
  )
}

// A day against the user's own usual (personalBaseline.js). Today is still
// running, so cumulative values show the usual as a reference instead of a
// gap that would look like a deficit every morning. Average attention is not
// cumulative and can be compared at any time. A usual read on an earlier
// measurement method is only ever a labelled reference: the methods read
// differently, so a +/− against it would partly be a measurement effect.
function BaselineNote({ value, usual, format, unit = 1, cumulative, isToday, baseline }) {
  if (usual == null) return null
  // Round both sides to the unit shown before subtracting, so "+4 · 70"
  // never reads 74 against a median of 69.5 as "+5".
  const shown = number => Math.round(number / unit) * unit
  const { days, onEarlierMethod, currentMethodDays, required } = baseline
  if (onEarlierMethod) {
    const title = `The median of ${days} scored days on the earlier measurement method, shown for reference only: ` +
      `the methods read differently, so today is not compared with it. ` +
      `Your usual moves to the updated measurement after ${required} scored days on it (${currentMethodDays} of ${required}).`
    return (
      <small className="lab-baseline is-earlier-method" title={title}>
        Usual day {format(shown(usual))} · earlier method
      </small>
    )
  }
  const title = `Your usual: the median of your last ${days} scored days`
  if (value == null || (cumulative && isToday)) {
    return <small className="lab-baseline" title={title}>Usual day {format(shown(usual))}</small>
  }
  const delta = shown(value) - shown(usual)
  const text = delta === 0
    ? 'Same as usual'
    : `${delta > 0 ? '+' : '−'}${format(Math.abs(delta))} vs usual`
  return (
    <small className="lab-baseline" title={title}>
      <b className={delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : ''}>{text}</b> · {format(shown(usual))}
    </small>
  )
}

const formatPoints = value => String(Math.round(value))
const formatSeconds = value => formatDurationCompact(Math.round(value))

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

// A small (i) beside the score label opens the method as a popover, the way
// macOS puts help beside a control, so the hero stays free of running text.
function ScoreInfo() {
  return (
    <InfoPopover id="lab-score-method" label="How the Focus Score works">
      <FocusScoreMethod />
    </InfoPopover>
  )
}

export default function LabDashboard({ focusModeEnabled, sessions = [], ledger = null, quickStart = null, onAnalytics }) {
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
  const isToday = periodSelection.periodStart == null
  const baseline = useMemo(() => periodSelection.range === 'day'
    ? buildDayBaseline({
      ledger: source.ledger,
      sessions: source.sessions,
      dayStart: period.start instanceof Date ? period.start.getTime() : undefined,
      now: dashboardNow,
      metricVersion: FOCUS_SCORE.metricVersion,
    })
    : null, [source, period.start, periodSelection.range, dashboardNow])
  // After a scoring change the usual is silent until the new method has its
  // own scored days. Say so, rather than letting the comparison vanish.
  const baselineProgress = useMemo(() => periodSelection.range === 'day' && !baseline
    ? buildDayBaselineProgress({
      ledger: source.ledger,
      sessions: source.sessions,
      dayStart: period.start instanceof Date ? period.start.getTime() : undefined,
      now: dashboardNow,
      metricVersion: FOCUS_SCORE.metricVersion,
    })
    : null, [source, period.start, periodSelection.range, dashboardNow, baseline])
  const weekReview = useMemo(() => periodSelection.range === 'week'
    ? buildWeekReview({ ledger: source.ledger, sessions: source.sessions, weekStart: period.start instanceof Date ? period.start.getTime() : undefined, now: dashboardNow })
    : null, [source, period.start, periodSelection.range, dashboardNow])
  const lastWeekStart = lastCompletedWeekStart(dashboardNow)
  const lastWeekReview = useMemo(
    () => buildWeekReview({ ledger: source.ledger, sessions: source.sessions, weekStart: lastWeekStart.getTime(), now: dashboardNow }),
    // Recomputed when the week turns over, not on every clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, lastWeekStart.getTime()]
  )
  const [seenWeek, setSeenWeek] = useState(readSeenWeek)
  const offerLastWeek = periodSelection.range === 'day' && lastWeekReview.current.qualifyingCount > 0 &&
    seenWeek !== lastWeekReview.weekKey
  useEffect(() => {
    if (weekReview && weekReview.weekKey === lastWeekReview.weekKey && seenWeek !== weekReview.weekKey) {
      writeSeenWeek(weekReview.weekKey)
      setSeenWeek(weekReview.weekKey)
    }
  }, [weekReview, lastWeekReview.weekKey, seenWeek])
  const openLastWeek = () => setPeriodSelection({ range: 'week', periodStart: lastWeekStart.getTime() })
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
        </div>
      </header>

      {quickStart}

      {offerLastWeek && (
        <div className="lab-week-ready" role="status">
          <span>Your review of last week is ready.</span>
          <button type="button" className="lab-text-action" onClick={openLastWeek}>View week<Chevron direction="right" /></button>
        </div>
      )}

      <section className="lab-panel lab-hero" aria-labelledby="lab-title">
        <div className="lab-hero-head">
          <h2 id="lab-title">Focus Score</h2>
          <ScoreInfo />
        </div>
        <div className="lab-ring-column">
          <ScoreRings score={period.score} caption={period.score == null ? focusScoreLabel(period) : 'of 100'} rings={rings} />
          {baseline && (
            <BaselineNote value={period.score} usual={baseline.focusScore} format={formatPoints} cumulative isToday={isToday} baseline={baseline} />
          )}
          {baselineProgress?.earlierMethodDays > 0 && (
            <small className="lab-baseline" title="Earlier days used an earlier measurement method and are never compared with the current one.">
              Your usual returns after {baselineProgress.required} scored days on the updated measurement ({baselineProgress.days} of {baselineProgress.required})
            </small>
          )}
        </div>
        <div className="lab-metric-row">
          <Metric
            tone="time"
            label="Session time"
            value={time.focusSeconds == null ? null : formatDurationCompact(time.focusSeconds)}
            detail="Time in sessions, without breaks"
            // Session time has no usual on purpose (more hours is not better
            // work), but keeps the line's height so the three columns align.
            compare={baseline && <small className="lab-baseline is-spacer" aria-hidden="true">&nbsp;</small>}
          />
          <Metric
            tone="attention"
            label="Average attention"
            value={period.averageAttention == null ? null : Math.round(period.averageAttention)}
            suffix="/100"
            detail="Average while the camera could see you"
            compare={baseline && (
              <BaselineNote value={period.averageAttention} usual={baseline.averageAttention} format={formatPoints} isToday={isToday} baseline={baseline} />
            )}
          />
          <Metric
            tone="deep"
            label="Deep Focus"
            value={time.deepFocusSeconds == null ? null : formatDurationCompact(time.deepFocusSeconds)}
            detail="Stretches of 90 s or more of steady attention"
            status={time.deepFocusSeconds == null ? deepFocusDetail : null}
            compare={baseline && (
              <BaselineNote value={time.deepFocusSeconds} usual={baseline.deepFocusSeconds} format={formatSeconds} unit={60} cumulative isToday={isToday} baseline={baseline} />
            )}
          />
        </div>
      </section>

      <FocusScoreExplanation period={period} time={time} warningsOnly />

      {weekReview && <WeekReview review={weekReview} title={period.title} />}

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
