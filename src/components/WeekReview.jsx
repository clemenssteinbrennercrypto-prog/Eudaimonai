import { formatDurationCompact } from '../lib/durationFormat'
import { RECORD_LABELS } from '../lib/personalRecords'

function dayName(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'long' })
}

const minutes = seconds => formatDurationCompact(Math.round(seconds / 60) * 60)

/**
 * A comparison with last week. `lowerIsBetter` turns the colour around for
 * lapses; a change in the wrong direction stays neutral — reported, not
 * scolded. While the week is running, cumulative values show last week only.
 */
function Versus({ value, previous, format, unit = 1, cumulative = false, isCurrent, lowerIsBetter = false }) {
  if (previous == null) return null
  const shown = number => Math.round(number / unit) * unit
  if (value == null || (cumulative && isCurrent)) return <small>Last week {format(shown(previous))}</small>
  const delta = shown(value) - shown(previous)
  if (delta === 0) return <small>Same as last week</small>
  const better = lowerIsBetter ? delta < 0 : delta > 0
  return (
    <small>
      <b className={better ? 'is-up' : ''}>{delta > 0 ? '+' : '−'}{format(Math.abs(delta))} vs last week</b>
    </small>
  )
}

export default function WeekReview({ review, title }) {
  const { current, previous, isCurrent, recordsThisWeek } = review
  if (current.sessionCount === 0) {
    return (
      <section className="lab-panel lab-week-review" aria-labelledby="week-review-title">
        <div className="lab-panel-head"><h2 id="week-review-title">Week in review</h2><span>{title}</span></div>
        <p className="lab-empty-copy">{isCurrent ? 'No sessions this week yet.' : 'No sessions this week.'}</p>
      </section>
    )
  }
  const points = value => String(Math.round(value))
  const rate = value => (Number.isInteger(value) ? String(value) : value.toFixed(1))
  return (
    <section className="lab-panel lab-week-review" aria-labelledby="week-review-title">
      <div className="lab-panel-head"><h2 id="week-review-title">Week in review</h2><span>{title}</span></div>
      <dl className="lab-week-grid">
        <div>
          <dt>Deep Focus</dt>
          <dd><strong>{current.deepFocusSeconds == null ? '—' : minutes(current.deepFocusSeconds)}</strong>
            <Versus value={current.deepFocusSeconds} previous={previous?.deepFocusSeconds} format={minutes} unit={60} cumulative isCurrent={isCurrent} /></dd>
        </div>
        <div>
          <dt>Average attention</dt>
          <dd><strong>{current.averageAttention == null ? '—' : points(current.averageAttention)}</strong>
            <Versus value={current.averageAttention} previous={previous?.averageAttention} format={points} isCurrent={isCurrent} /></dd>
        </div>
        <div>
          <dt>Lapses per hour</dt>
          <dd><strong>{current.lapsesPerHour == null ? '—' : rate(current.lapsesPerHour)}</strong>
            <Versus value={current.lapsesPerHour} previous={previous?.lapsesPerHour} format={rate} unit={0.1} isCurrent={isCurrent} lowerIsBetter /></dd>
        </div>
        <div>
          <dt>Best day</dt>
          <dd><strong>{current.bestDay ? dayName(current.bestDay.dayKey) : '—'}</strong>
            {current.bestDay && <small>Focus Score {current.bestDay.score}</small>}</dd>
        </div>
      </dl>
      {recordsThisWeek.length > 0 && (
        <p className="lab-week-records">
          Records set this week: {recordsThisWeek.map(record => RECORD_LABELS[record.key]).join(' · ')}
        </p>
      )}
    </section>
  )
}
