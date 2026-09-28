/**
 * Glass tooltip positioned beside the active mark, never on top of it: it sits
 * to the right of the point on the left part of the chart and flips to the left
 * past 60% of the width, so the pointer's column always stays readable.
 */
export default function ChartTooltip({ x, y, width, height, visible, children }) {
  const flip = x > width * 0.6
  const top = Math.min(Math.max(y, 44), Math.max(44, height - 44))
  return (
    <div
      role="tooltip"
      className={`analytics-chart-tooltip${visible ? ' is-visible' : ''}${flip ? ' is-flipped' : ''}`}
      style={{ left: `${x}px`, top: `${top}px` }}
    >
      {children}
    </div>
  )
}
