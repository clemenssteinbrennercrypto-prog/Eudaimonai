import { formatMinutes } from '../lib/durationFormat'

export function focusScoreLabel(period) {
  if (period.score == null) return 'Not measured'
  return 'Focus Score'
}

export default function FocusScoreExplanation({ period, time = null }) {
  const today = period.today
  const selectedDay = period.range === 'day' ? period.days[0] : null
  const statusDay = selectedDay || today
  const when = today && statusDay === today ? 'today' : 'this day'
  let status = null
  if (statusDay?.status === 'inactive') status = `No session ${when}.`
  if (statusDay?.status === 'unmeasured') status = `No qualifying measurement ${when}. A session needs at least ${formatMinutes(5)} of measured time.`
  if (statusDay?.status === 'different_generation') status = `Measurements ${when} use a different camera method and are excluded from this comparison.`
  if (statusDay?.status === 'future') status = 'This day is in the future.'
  if (!selectedDay && today?.status === 'measured') status = `Today’s score: ${today.score}.`
  if (!status && period.score == null) status = 'No qualifying measurements in this period.'

  return (
    <div className="focus-score-explanation">
      {status && <p>{status}</p>}
      {period.range !== 'day' && period.score != null && (
        <p>Every measured second in this period has equal weight. Days without sessions do not lower the score.</p>
      )}
      {time?.measurementWarning && (
        <p>Only {Math.round(time.measurementCoverage * 100)}% of Focus Time could be measured. Focus Score uses the measured time only; missing camera data is not guessed.</p>
      )}
      <details>
        <summary>How this score works</summary>
        <p>Focus Score is your average measured attention quality on a 0–100 scale. Session length does not raise or lower it.</p>
        <p>Focus Time is active session time with breaks excluded. Deep Focus counts sustained high-attention blocks after they pass the 90-second entry gate.</p>
        <p>At least {formatMinutes(5)} of measured time in a session is required before it contributes to Focus Score. Camera gaps are excluded rather than treated as focus or distraction. Sessions are assigned to their start date.</p>
      </details>
    </div>
  )
}
