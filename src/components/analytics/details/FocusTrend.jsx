import { useId, useState } from 'react'
import { formatMinutes } from '../../../lib/durationFormat'
import ChartTooltip from '../chart/ChartTooltip'
import { useChartWidth, useCountUp } from '../chart/hooks'
import { smoothAreaPath, smoothLinePath } from '../chart/smoothPath'
import { OUTCOME_META, fmtDate, fmtWeekdayDate, pointDescription, sessionLabel, svgId } from './format'

const HEIGHT = 280
const MARGIN = { top: 22, right: 22, bottom: 36 }

/**
 * Sessions minutes apart would otherwise stack into one unclickable dot, so
 * neighbours are pushed at least 32px apart while staying inside the plot.
 */
function spreadPositions(positions, leftBound, rightBound) {
  if (positions.length < 2) return positions
  const spread = [...positions]
  const spacing = Math.min(32, (rightBound - leftBound) / (spread.length - 1))
  for (let index = 1; index < spread.length; index += 1) {
    spread[index] = Math.max(spread[index], spread[index - 1] + spacing)
  }
  if (spread.at(-1) > rightBound) {
    spread[spread.length - 1] = rightBound
    for (let index = spread.length - 2; index >= 0; index -= 1) {
      spread[index] = Math.min(spread[index], spread[index + 1] - spacing)
    }
  }
  if (spread[0] < leftBound) {
    spread[0] = leftBound
    for (let index = 1; index < spread.length; index += 1) {
      spread[index] = Math.max(spread[index], spread[index - 1] + spacing)
    }
  }
  return spread
}

function fmtTick(timestamp, includeTime) {
  if (!includeTime) return fmtDate(timestamp)
  const time = new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmtDate(timestamp)} · ${time}`
}

function activateOnKey(event, action) {
  if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return
  event?.preventDefault()
  action()
}

export function DetailsHeadline({ headline }) {
  const animated = useCountUp(headline.averageAttention ?? 0)
  if (headline.averageAttention == null) return null
  const delta = headline.delta
  return (
    <div className="analytics-headline">
      <strong className="analytics-headline-value">{Math.round(animated)}</strong>
      <div className="analytics-headline-meta">
        {delta != null && (
          <span className={`analytics-delta ${delta > 0 ? 'is-up' : delta < 0 ? 'is-down' : 'is-flat'}`}>
            <b aria-hidden="true">{delta > 0 ? '▲' : delta < 0 ? '▼' : '■'}</b>
            {`${delta > 0 ? '+' : ''}${delta}`}
            <small>vs previous {headline.windowDays} days</small>
          </span>
        )}
        <span className="analytics-headline-label">Average attention · {sessionLabel(headline.sessionCount)}</span>
      </div>
    </div>
  )
}

export default function FocusTrend({ rows, onSelect }) {
  const [wrapRef, width] = useChartWidth()
  const [activeId, setActiveId] = useState(null)
  const reactId = useId()
  const areaId = svgId(reactId, 'focus-area')

  const plotted = rows.filter(row => row.scoreEligible)
  if (plotted.length === 0) {
    return <p className="analytics-details-empty">No sessions with at least 10 minutes of reliable measurement match these filters.</p>
  }

  const left = width < 520 ? 30 : 40
  const plotRight = width - MARGIN.right
  const plotBottom = HEIGHT - MARGIN.bottom
  // Only plotted sessions set the time axis; an excluded session must not stretch it.
  const timestamps = plotted.map(row => row.timestamp)
  const firstTimestamp = Math.min(...timestamps)
  const lastTimestamp = Math.max(...timestamps)
  const leftBound = left + 8
  const rightBound = plotRight - 8
  const x = timestamp => firstTimestamp === lastTimestamp
    ? (left + plotRight) / 2
    : leftBound + ((timestamp - firstTimestamp) / (lastTimestamp - firstTimestamp)) * (rightBound - leftBound)
  const y = value => plotBottom - (value / 100) * (plotBottom - MARGIN.top)

  const spreadX = spreadPositions(plotted.map(row => x(row.timestamp)), leftBound, rightBound)
  const positioned = plotted.map((row, index) => ({ row, cx: spreadX[index], cy: y(row.averageAttention) }))
  const oneCalendarDay = new Date(firstTimestamp).toDateString() === new Date(lastTimestamp).toDateString()
  const series = new Map()
  positioned.forEach(point => {
    if (!series.has(point.row.generation)) series.set(point.row.generation, [])
    series.get(point.row.generation).push(point)
  })
  const tickCount = firstTimestamp === lastTimestamp ? 1 : width >= 720 ? 5 : 3
  const dateTicks = [...new Map(Array.from({ length: tickCount }, (_, index) => {
    const timestamp = tickCount === 1 ? firstTimestamp : firstTimestamp + ((lastTimestamp - firstTimestamp) * index) / (tickCount - 1)
    return [fmtTick(timestamp, oneCalendarDay), timestamp]
  })).values()]

  const active = positioned.find(point => point.row.id === activeId) || null
  const latestCurrent = positioned.at(-1)
  // Personal best on the current ruler only; the latest of equal peaks wins.
  const best = positioned.filter(point => point.row.currentGeneration)
    .reduce((top, point) => (!top || point.row.averageAttention >= top.row.averageAttention ? point : top), null)
  const showBest = best && positioned.filter(point => point.row.currentGeneration).length >= 3

  const nearestTo = clientX => {
    const bounds = wrapRef.current?.getBoundingClientRect()
    if (!bounds) return null
    const pointerX = clientX - bounds.left
    let best = null
    for (const point of positioned) {
      if (!best || Math.abs(point.cx - pointerX) < Math.abs(best.cx - pointerX)) best = point
    }
    return best
  }

  return (
    <>
      <div className="analytics-focus-legend">
        <span className="analytics-focus-legend-axis">Average attention / 100 · chronological</span>
      </div>
      <div className="analytics-chart-frame" ref={wrapRef}>
        <svg
          className="analytics-main-plot"
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="group"
          aria-label={`Average attention across ${sessionLabel(plotted.length)} with at least 10 minutes of reliable measurement`}
        >
          <defs>
            <linearGradient id={areaId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--ds-attn-high)" stopOpacity="0.18" />
              <stop offset="70%" stopColor="var(--ds-attn-high)" stopOpacity="0.04" />
              <stop offset="100%" stopColor="var(--ds-attn-high)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[25, 50, 75, 100].map(value => (
            <g key={value} className="analytics-grid">
              <line x1={left} x2={plotRight} y1={y(value)} y2={y(value)} />
              <text x={left - 10} y={y(value) + 4} textAnchor="end">{value}</text>
            </g>
          ))}
          <line className="analytics-baseline" x1={left} x2={plotRight} y1={plotBottom} y2={plotBottom} />
          <rect
            className="analytics-plot-capture"
            x={left}
            y={MARGIN.top - 12}
            width={Math.max(0, plotRight - left)}
            height={plotBottom - MARGIN.top + 12}
            onMouseMove={event => setActiveId(nearestTo(event.clientX)?.row.id ?? null)}
            onMouseLeave={() => setActiveId(null)}
            onClick={event => { const point = nearestTo(event.clientX); if (point) onSelect(point.row.id) }}
          />
          {/* One continuous wash under every generation keeps the chart visually whole;
              the lines above it stay separate per ruler and are never joined. */}
          {positioned.length > 1 && (
            <path
              className="analytics-series-area"
              d={smoothAreaPath(positioned.map(point => ({ x: point.cx, y: point.cy })), plotBottom)}
              fill={`url(#${areaId})`}
            />
          )}
          {active && (
            <line className="analytics-crosshair" x1={active.cx} x2={active.cx} y1={MARGIN.top - 8} y2={plotBottom} />
          )}
          {[...series.entries()].map(([generation, items]) => (
            <path
              key={generation}
              className={`analytics-series-line ${items[0].row.currentGeneration ? 'is-current-generation' : 'is-earlier-generation'}`}
              d={smoothLinePath(items.map(point => ({ x: point.cx, y: point.cy })))}
              pathLength={1}
            />
          ))}
          {positioned.map((point, index) => (
            <g
              key={point.row.id}
              className={`analytics-focus-point ${point.row.currentGeneration ? 'is-current-generation' : 'is-earlier-generation'}${activeId === point.row.id ? ' is-active' : ''}`}
              style={{ '--i': index }}
              role="button"
              tabIndex={0}
              aria-label={`${pointDescription(point.row)}. Open session details.`}
              onClick={event => activateOnKey(event, () => onSelect(point.row.id))}
              onKeyDown={event => activateOnKey(event, () => onSelect(point.row.id))}
              onMouseEnter={() => setActiveId(point.row.id)}
              onFocus={() => setActiveId(point.row.id)}
              onBlur={() => setActiveId(null)}
            >
              <circle className="analytics-point-hit" cx={point.cx} cy={point.cy} r="16" />
              <circle className="analytics-point-halo" cx={point.cx} cy={point.cy} r="13" />
              <circle className="analytics-focus-point-mark" cx={point.cx} cy={point.cy} r="4.5" />
            </g>
          ))}
          {showBest && (
            <g className="analytics-best-mark" aria-hidden="true">
              <circle className="analytics-best-pulse" cx={best.cx} cy={best.cy} r="9" />
              {activeId !== best.row.id && (
                <text x={best.cx} y={best.cy - 16} textAnchor={best.cx > plotRight - 30 ? 'end' : best.cx < left + 30 ? 'start' : 'middle'}>
                  Best · {best.row.averageAttention}
                </text>
              )}
            </g>
          )}
          {latestCurrent && activeId !== latestCurrent.row.id && !(showBest && best.row.id === latestCurrent.row.id) && (
            <text className="analytics-point-label" x={latestCurrent.cx} y={latestCurrent.cy - 14} textAnchor={latestCurrent.cx > plotRight - 20 ? 'end' : 'middle'} aria-hidden="true">
              {latestCurrent.row.averageAttention}
            </text>
          )}
          {dateTicks.map((timestamp, index) => (
            <text
              key={timestamp}
              className="analytics-axis-date"
              x={tickCount === 1 ? x(timestamp) : index === 0 ? left : index === dateTicks.length - 1 ? plotRight : x(timestamp)}
              y={HEIGHT - 10}
              textAnchor={tickCount === 1 ? 'middle' : index === 0 ? 'start' : index === dateTicks.length - 1 ? 'end' : 'middle'}
            >
              {fmtTick(timestamp, oneCalendarDay)}
            </text>
          ))}
        </svg>
        <ChartTooltip x={active?.cx ?? 0} y={active?.cy ?? 0} width={width} height={HEIGHT} visible={Boolean(active)}>
          {active && (
            <>
              <small>{fmtWeekdayDate(active.row.timestamp)}{active.row.currentGeneration ? '' : ' · earlier method'}</small>
              <strong>{active.row.averageAttention}<em>/100</em></strong>
              <span>
                {active.row.durationMinutes != null && <>{formatMinutes(active.row.durationMinutes)}</>}
                {active.row.workspace && <> · {active.row.workspace}</>}
              </span>
              <i className={`analytics-outcome-badge ${OUTCOME_META[active.row.outcome || 'unrated'].className}`}>
                {OUTCOME_META[active.row.outcome || 'unrated'].label}
              </i>
            </>
          )}
        </ChartTooltip>
      </div>
    </>
  )
}
