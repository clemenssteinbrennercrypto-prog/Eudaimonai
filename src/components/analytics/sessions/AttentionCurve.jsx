import { useId, useState } from 'react'
import { FOCUSED_SCORE, GOOD_STREAK_SCORE } from '../../../lib/attention'
import { fmtClock, fmtDuration } from '../../../lib/sessionAnalysisPresentation'
import { sessionPauseIntervals, sessionStartedAt, sessionWallSeconds, timelineWallSecond } from '../../../lib/sessionTiming'
import ChartTooltip from '../chart/ChartTooltip'
import { useChartWidth } from '../chart/hooks'
import { smoothAreaPath, smoothLinePath } from '../chart/smoothPath'
import { svgId } from '../details/format'

const HEIGHT = 230
const MARGIN = { top: 18, right: 18, bottom: 32 }
const SAMPLE_SECONDS = 5

function fmtWallTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Average the five-second samples into display buckets so a long session reads
 * as a curve rather than noise. Buckets with no samples (pauses, camera gaps)
 * split the line instead of being bridged, so a gap is never drawn as data.
 */
export function bucketAttention(timeline, domainSeconds, targetBuckets) {
  const points = (Array.isArray(timeline) ? timeline : [])
    .map(point => ({ at: timelineWallSecond(point), score: point?.score }))
    .filter(point => point.at != null && Number.isFinite(point.score) && point.at <= domainSeconds)
  if (!points.length || !(domainSeconds > 0)) return { bucketSeconds: SAMPLE_SECONDS, segments: [] }

  const rawStep = domainSeconds / Math.max(1, targetBuckets)
  const bucketSeconds = Math.max(SAMPLE_SECONDS, Math.ceil(rawStep / SAMPLE_SECONDS) * SAMPLE_SECONDS)
  const buckets = new Map()
  for (const point of points) {
    const index = Math.floor(point.at / bucketSeconds)
    if (!buckets.has(index)) buckets.set(index, [])
    buckets.get(index).push(point.score)
  }
  const ordered = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, scores]) => ({
      index,
      at: Math.min(domainSeconds, (index + 0.5) * bucketSeconds),
      score: Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length),
    }))

  const segments = []
  for (const bucket of ordered) {
    const current = segments.at(-1)
    if (current && bucket.index - current.at(-1).index === 1) current.push(bucket)
    else segments.push([bucket])
  }
  return { bucketSeconds, segments }
}

export default function AttentionCurve({ session }) {
  const [wrapRef, width] = useChartWidth()
  const [active, setActive] = useState(null)
  const reactId = useId()
  const strokeId = svgId(reactId, 'curve-stroke')
  const fillId = svgId(reactId, 'curve-fill')

  const startedAt = sessionStartedAt(session)
  const timeline = Array.isArray(session?.timeline) ? session.timeline : []
  const lastSample = Math.max(0, ...timeline.map(point => timelineWallSecond(point) ?? 0))
  const domainSeconds = Math.max(sessionWallSeconds(session) || 0, lastSample)
  const left = width < 520 ? 30 : 40
  const plotRight = width - MARGIN.right
  const plotBottom = HEIGHT - MARGIN.bottom
  const { bucketSeconds, segments } = bucketAttention(timeline, domainSeconds, Math.floor((plotRight - left) / 7))
  if (!segments.length) return null

  const x = second => left + (second / domainSeconds) * (plotRight - left)
  const y = score => plotBottom - (score / 100) * (plotBottom - MARGIN.top)
  const all = segments.flat()
  const pauses = startedAt == null ? [] : sessionPauseIntervals(session).map(pause => ({
    from: Math.max(0, (pause.startedAt - startedAt) / 1000),
    to: Math.min(domainSeconds, (pause.endedAt - startedAt) / 1000),
  })).filter(pause => pause.to > pause.from)
  const label = second => (startedAt == null ? fmtClock(second) : fmtWallTime(startedAt + second * 1000))
  // Start and end always show; inner ticks only where they keep 80px apart.
  const ticks = [0, 0.25, 0.5, 0.75].map(share => share * domainSeconds)
    .reduce((kept, second) => (kept.length === 0 || x(second) - x(kept.at(-1)) >= 80 ? [...kept, second] : kept), [])
    .filter((second, index) => index === 0 || x(domainSeconds) - x(second) >= 80)
    .concat(domainSeconds)

  const nearest = clientX => {
    const bounds = wrapRef.current?.getBoundingClientRect()
    if (!bounds) return null
    const second = ((clientX - bounds.left - left) / (plotRight - left)) * domainSeconds
    let best = null
    for (const bucket of all) {
      if (!best || Math.abs(bucket.at - second) < Math.abs(best.at - second)) best = bucket
    }
    return best
  }
  const band = score => (score >= GOOD_STREAK_SCORE ? 'High attention' : score >= FOCUSED_SCORE ? 'Focused' : 'Low attention')
  // Hard colour stops at the app's real thresholds: the line changes colour
  // exactly where the scoring changes band, not at a decorative midpoint.
  const stops = [
    ['0%', 'var(--good)'],
    [`${((y(GOOD_STREAK_SCORE) - MARGIN.top) / (plotBottom - MARGIN.top)) * 100}%`, 'var(--good)'],
    [`${((y(GOOD_STREAK_SCORE) - MARGIN.top) / (plotBottom - MARGIN.top)) * 100}%`, 'var(--warn)'],
    [`${((y(FOCUSED_SCORE) - MARGIN.top) / (plotBottom - MARGIN.top)) * 100}%`, 'var(--warn)'],
    [`${((y(FOCUSED_SCORE) - MARGIN.top) / (plotBottom - MARGIN.top)) * 100}%`, 'var(--bad)'],
    ['100%', 'var(--bad)'],
  ]

  return (
    <div className="session-curve">
      <div className="analytics-chart-frame" ref={wrapRef}>
        <svg
          className="analytics-main-plot session-curve-plot"
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={`Attention through the session, averaged every ${fmtDuration(bucketSeconds)}`}
          onMouseMove={event => setActive(nearest(event.clientX))}
          onMouseLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id={strokeId} x1="0" x2="0" y1={MARGIN.top} y2={plotBottom} gradientUnits="userSpaceOnUse">
              {stops.map(([offset, color], index) => <stop key={index} offset={offset} stopColor={color} />)}
            </linearGradient>
            <linearGradient id={fillId} x1="0" x2="0" y1={MARGIN.top} y2={plotBottom} gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--ultra-bright)" stopOpacity="0.24" />
              <stop offset="75%" stopColor="var(--ultra)" stopOpacity="0.05" />
              <stop offset="100%" stopColor="var(--ultra)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75, 100].map(value => (
            <g key={value} className="analytics-grid">
              <line x1={left} x2={plotRight} y1={y(value)} y2={y(value)} />
              <text x={left - 10} y={y(value) + 4} textAnchor="end">{value}</text>
            </g>
          ))}
          {[[GOOD_STREAK_SCORE, 'high'], [FOCUSED_SCORE, 'focused']].map(([value, name]) => (
            <g key={name} className={`session-curve-threshold is-${name}`}>
              <line x1={left} x2={plotRight} y1={y(value)} y2={y(value)} />
            </g>
          ))}
          {pauses.map((pause, index) => (
            <g key={index} className="session-curve-pause">
              <rect x={x(pause.from)} y={MARGIN.top} width={Math.max(2, x(pause.to) - x(pause.from))} height={plotBottom - MARGIN.top} rx="4" />
              {x(pause.to) - x(pause.from) > 40 && <text x={(x(pause.from) + x(pause.to)) / 2} y={MARGIN.top + 14} textAnchor="middle">Break</text>}
            </g>
          ))}
          <line className="analytics-baseline" x1={left} x2={plotRight} y1={plotBottom} y2={plotBottom} />
          {segments.map((segment, index) => segment.length > 1 && (
            <path key={`area-${index}`} className="session-curve-area" d={smoothAreaPath(segment.map(b => ({ x: x(b.at), y: y(b.score) })), plotBottom)} fill={`url(#${fillId})`} />
          ))}
          {segments.map((segment, index) => (
            segment.length > 1
              ? <path key={index} className="session-curve-line" d={smoothLinePath(segment.map(b => ({ x: x(b.at), y: y(b.score) })))} stroke={`url(#${strokeId})`} pathLength="1" />
              : <circle key={index} className="session-curve-dot" cx={x(segment[0].at)} cy={y(segment[0].score)} r="2.5" fill={`url(#${strokeId})`} />
          ))}
          {active && (
            <g className="session-curve-active">
              <line className="analytics-crosshair" x1={x(active.at)} x2={x(active.at)} y1={MARGIN.top} y2={plotBottom} />
              <circle cx={x(active.at)} cy={y(active.score)} r="5" />
            </g>
          )}
          {ticks.map((second, index) => (
            <text
              key={second}
              className="analytics-axis-date"
              x={x(second)}
              y={HEIGHT - 9}
              textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'}
            >
              {label(second)}
            </text>
          ))}
        </svg>
        <ChartTooltip x={active ? x(active.at) : 0} y={active ? y(active.score) : 0} width={width} height={HEIGHT} visible={Boolean(active)}>
          {active && (
            <>
              <small>{label(active.at)}</small>
              <strong>{active.score}<em>/100</em></strong>
              <span>{band(active.score)}</span>
            </>
          )}
        </ChartTooltip>
      </div>
      <div className="session-curve-legend">
        <span><i className="is-good" />High · {GOOD_STREAK_SCORE}+</span>
        <span><i className="is-warn" />Focused · {FOCUSED_SCORE}–{GOOD_STREAK_SCORE - 1}</span>
        <span><i className="is-bad" />Low · under {FOCUSED_SCORE}</span>
        <em>Each point averages {fmtDuration(bucketSeconds)} of samples</em>
      </div>
    </div>
  )
}
