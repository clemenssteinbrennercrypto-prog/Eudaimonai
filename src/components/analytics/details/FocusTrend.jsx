import { useId, useState } from 'react'
import { formatMinutes } from '../../../lib/durationFormat'
import ChartTooltip from '../chart/ChartTooltip'
import { useChartWidth, useCountUp } from '../chart/hooks'
import { smoothAreaPath, smoothLinePath } from '../chart/smoothPath'
import { OUTCOME_META, fmtDate, fmtWeekdayDate, pointDescription, sessionLabel, svgId } from './format'

const HEIGHT = 280
const MARGIN = { top: 22, right: 22, bottom: 36 }

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
  const timestamps = rows.map(row => row.timestamp).filter(Number.isFinite)
  const firstTimestamp = Math.min(...timestamps)
  const lastTimestamp = Math.max(...timestamps)
  const x = timestamp => firstTimestamp === lastTimestamp
    ? (left + plotRight) / 2
    : left + 8 + ((timestamp - firstTimestamp) / (lastTimestamp - firstTimestamp)) * (plotRight - left - 16)
  const y = value => plotBottom - (value / 100) * (plotBottom - MARGIN.top)

  const positioned = plotted.map(row => ({ row, cx: x(row.timestamp), cy: y(row.averageAttention) }))
  const series = new Map()
  positioned.forEach(point => {
    if (!series.has(point.row.generation)) series.set(point.row.generation, [])
    series.get(point.row.generation).push(point)
  })
  const tickCount = firstTimestamp === lastTimestamp ? 1 : width >= 720 ? 5 : 3
  const dateTicks = [...new Map(Array.from({ length: tickCount }, (_, index) => {
    const timestamp = tickCount === 1 ? firstTimestamp : firstTimestamp + ((lastTimestamp - firstTimestamp) * index) / (tickCount - 1)
    return [fmtDate(timestamp), timestamp]
  })).values()]

  const active = positioned.find(point => point.row.id === activeId) || null
  const latestCurrent = positioned.at(-1)

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
              <stop offset="0%" stopColor="var(--ultra-bright)" stopOpacity="0.28" />
              <stop offset="70%" stopColor="var(--ultra)" stopOpacity="0.06" />
              <stop offset="100%" stopColor="var(--ultra)" stopOpacity="0" />
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
          {latestCurrent && activeId !== latestCurrent.row.id && (
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
              {fmtDate(timestamp)}
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
