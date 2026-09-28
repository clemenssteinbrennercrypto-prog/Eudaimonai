import { useId, useState } from 'react'
import { formatMinutes } from '../../../lib/durationFormat'
import ChartTooltip from '../chart/ChartTooltip'
import { useChartWidth } from '../chart/hooks'
import { fmtDate, pointDescription, sessionLabel, svgId } from './format'

const HEIGHT = 250
const MARGIN = { top: 30, right: 22, bottom: 36 }

function DurationPoint({ sessions, cx, cy, index, active, onActivate, onDeactivate, onSelect }) {
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
  const radius = Math.min(9, 4.5 + (count - 1) * 1.5)
  return (
    <g
      className={`analytics-duration-point${count > 1 ? ' has-count' : ''}${active ? ' is-active' : ''}`}
      style={{ '--i': index }}
      role="button"
      tabIndex={0}
      aria-label={`${description}. Open ${count > 1 ? 'the most recent' : 'session'} details.`}
      onClick={activate}
      onKeyDown={activate}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
    >
      <circle className="analytics-point-hit" cx={cx} cy={cy} r="16" />
      <circle className="analytics-point-halo" cx={cx} cy={cy} r={radius + 8} />
      <circle className="analytics-duration-point-mark" cx={cx} cy={cy} r={radius} />
      {count > 1 && <text x={cx + radius + 5} y={cy - radius - 2}>×{count}</text>}
    </g>
  )
}

function durationTickStep(axisMin, axisMax) {
  const rawStep = (axisMax - axisMin) / 9
  return [20, 30, 60, 120, 240, 480, 960].find(step => step >= rawStep) || Math.ceil(rawStep / 960) * 960
}

export default function DurationPlot({ rows, analysis, onSelect }) {
  const [wrapRef, width] = useChartWidth()
  const [activeKey, setActiveKey] = useState(null)
  const reactId = useId()
  const trendId = svgId(reactId, 'duration-trend')

  const axisMin = 10
  const observedMax = Math.max(axisMin, ...rows.map(row => row.durationMinutes))
  const axisMax = Math.max(30, Math.ceil(observedMax / 15) * 15 + (observedMax > 90 ? 15 : 0))
  const trend = analysis.trend
  const tickStep = durationTickStep(axisMin, axisMax)
  // The robust trend can end below every point; keep its ends inside the axis.
  const lowestAttention = Math.min(
    ...rows.map(row => row.averageAttention),
    ...(trend ? [trend.startAttention, trend.endAttention] : []),
  )
  const attentionMin = Math.max(0, Math.floor((lowestAttention - 10) / 25) * 25)
  const attentionTicks = Array.from({ length: Math.floor((100 - attentionMin) / 25) + 1 }, (_, index) => attentionMin + index * 25)
  const left = width < 520 ? 30 : 40
  const plotRight = width - MARGIN.right
  const plotBottom = HEIGHT - MARGIN.bottom
  const x = value => left + 8 + ((value - axisMin) / (axisMax - axisMin)) * (plotRight - left - 16)
  const y = value => plotBottom - ((value - attentionMin) / (100 - attentionMin)) * (plotBottom - MARGIN.top)
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
  const clusters = [...grouped.entries()]
  const medianReady = analysis.count >= 3
  const signedTrend = trend == null
    ? null
    : `${trend.pointsPer30Minutes > 0 ? '+' : ''}${trend.pointsPer30Minutes}`
  const activeCluster = grouped.get(activeKey)

  return (
    <>
      <div className="analytics-duration-readout">
        <span>{sessionLabel(rows.length)}</span>
        <span>Median <strong>{formatMinutes(analysis.medianDurationMinutes)} · {analysis.medianAttention}/100</strong></span>
        {trend ? <span>Trend <strong>{signedTrend} points / 30 min</strong> <em>association only</em></span> : <span>Trend needs 8 varied sessions</span>}
      </div>
      <div className="analytics-chart-frame" ref={wrapRef}>
        <svg
          className="analytics-secondary-plot analytics-duration-plot"
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="group"
          aria-label={`Focus time and average attention across ${sessionLabel(rows.length)}`}
        >
          <defs>
            <linearGradient id={trendId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="var(--ultra-bright)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--ultra-bright)" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          {attentionTicks.map(value => (
            <g key={value} className="analytics-grid">
              <line x1={left} x2={plotRight} y1={y(value)} y2={y(value)} />
              <text x={left - 10} y={y(value) + 4} textAnchor="end">{value}</text>
            </g>
          ))}
          {medianReady && (
            <g className="analytics-duration-reference" aria-label={`Median focus time: ${formatMinutes(analysis.medianDurationMinutes)}`}>
              <line x1={x(analysis.medianDurationMinutes)} x2={x(analysis.medianDurationMinutes)} y1={MARGIN.top - 6} y2={plotBottom} />
              <text x={x(analysis.medianDurationMinutes)} y={MARGIN.top - 12} textAnchor="middle">median</text>
            </g>
          )}
          {trend && (
            <line
              className="analytics-duration-trend"
              x1={x(trend.minDuration)}
              x2={x(trend.maxDuration)}
              y1={y(trend.startAttention)}
              y2={y(trend.endAttention)}
              stroke={`url(#${trendId})`}
            />
          )}
          {clusters.map(([key, sessions], index) => (
            <DurationPoint
              key={key}
              sessions={sessions}
              index={index}
              cx={x(sessions[0].durationMinutes)}
              cy={y(sessions[0].averageAttention)}
              active={activeKey === key}
              onActivate={() => setActiveKey(key)}
              onDeactivate={() => setActiveKey(current => (current === key ? null : current))}
              onSelect={onSelect}
            />
          ))}
          {durationTicks.filter((value, index) => index === 0 || x(value) - x(durationTicks[0]) >= 44).map(value => (
            <text key={value} className="analytics-axis-date" x={x(value)} y={HEIGHT - 10} textAnchor={value === axisMin ? 'start' : 'middle'}>{value}m</text>
          ))}
        </svg>
        <ChartTooltip
          x={activeCluster ? x(activeCluster[0].durationMinutes) : 0}
          y={activeCluster ? y(activeCluster[0].averageAttention) : 0}
          width={width}
          height={HEIGHT}
          visible={Boolean(activeCluster)}
        >
          {activeCluster && (
            <>
              <small>{activeCluster.length > 1 ? sessionLabel(activeCluster.length) : fmtDate(activeCluster[0].timestamp)}</small>
              <strong>{activeCluster[0].averageAttention}<em>/100</em></strong>
              <span>{formatMinutes(activeCluster[0].durationMinutes)} focus time</span>
            </>
          )}
        </ChartTooltip>
      </div>
    </>
  )
}
