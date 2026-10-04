import { formatMinutes } from '../lib/durationFormat'
import { FOCUS_SCORE } from '../lib/focusScore'

// The method in plain words. Analytics shows it in a disclosure, the Lab in
// a popover next to the score, so both read from this one text.
export function FocusScoreMethod() {
  return (
    <>
      <p>Measured Focus Time is the volume. Average Attention scales that time from no credit at {FOCUS_SCORE.qualityFloor} to full credit at {FOCUS_SCORE.qualityCeiling}. Exact Deep Focus minutes receive a {Math.round(FOCUS_SCORE.deepFocusBonus * 100)}% continuity bonus before the same quality factor is applied.</p>
      <p>More work at the same quality always raises the score. The curve starts gently so very short sessions earn little, then applies diminishing returns: within one weekday, {formatMinutes(FOCUS_SCORE.referenceMinutesPerWorkday)} effective minutes scores 50, four effective hours score about 81 and eight score about 91. A week or month adds its raw measurements before calculating one score instead of averaging daily scores.</p>
      <p>The score is accumulated focused work, not an attention percentage or a claim about output quality. Focus Time, Deep Focus and Average Attention remain visible separately so the result can be explained.</p>
      <p>At least {formatMinutes(5)} of measured time in a session is required. Breaks and camera gaps earn nothing. Sessions are assigned to their start date, and older sessions without exact Deep Focus are never guessed.</p>
    </>
  )
}

export function focusScoreLabel(period) {
  if (period.score == null) return 'Not measured'
  return 'Focus Score'
}

// warningsOnly (the Lab) drops the routine lines and the explainer and keeps
// only what says the number is missing or rests on incomplete measurement:
// refusals, missing exact Deep Focus, a different camera generation, too
// little measured time, and camera coverage below 90 % (AGENTS.md §4.10).
// Analytics keeps the full explanation.
export default function FocusScoreExplanation({ period, time = null, warningsOnly = false }) {
  const today = period.today
  const selectedDay = period.range === 'day' ? period.days[0] : null
  const statusDay = selectedDay || today
  const when = today && statusDay === today ? 'today' : 'this day'
  let status = null
  let routine = false
  if (statusDay?.status === 'inactive') { status = `No session ${when}.`; routine = true }
  if (statusDay?.status === 'unmeasured') status = `No qualifying measurement ${when}. A session needs at least ${formatMinutes(5)} of measured time.`
  if (statusDay?.status === 'different_generation') status = `Measurements ${when} use a different camera method and are excluded from this comparison.`
  if (statusDay?.status === 'before_metric') status = `This day predates the exact Deep Focus measurement required by the current Focus Score.`
  if (statusDay?.status === 'awaiting_metric') status = `No session ${when} recorded the exact Deep Focus time required to start the current Focus Score.`
  if (statusDay?.status === 'unscorable') status = `A session ${when} is missing exact Deep Focus time, so no score is shown rather than a partial estimate.`
  if (statusDay?.status === 'future') { status = 'This day is in the future.'; routine = true }
  if (!selectedDay && period.refusal) { status = 'Some sessions after this score began are missing exact Deep Focus time, so no period score is shown rather than a partial estimate.'; routine = false }
  else if (!selectedDay && period.beforeMetricPeriod) { status = 'The current Focus Score did not exist for this period. Historical Focus Time remains visible; no score is reconstructed.'; routine = false }
  else if (!selectedDay && today?.status === 'measured') { status = `Today’s score: ${today.score}.`; routine = true }
  if (!status && period.score == null) { status = 'No qualifying measurements in this period.'; routine = true }
  const showStatus = status && !(warningsOnly && routine)
  const scoreMeasuredSeconds = period.score != null && Number.isFinite(period.measuredSeconds)
    ? period.measuredSeconds
    : null
  const totalFocusSeconds = Number.isFinite(time?.focusSeconds) ? time.focusSeconds : null
  const scoreUsesPartialFocusTime = scoreMeasuredSeconds != null && totalFocusSeconds != null &&
    totalFocusSeconds > scoreMeasuredSeconds + 60

  const hasContent = showStatus || period.partialMetricPeriod ||
    time?.measurementWarning || time?.measurementCoverageUnknown || !warningsOnly
  if (!hasContent) return null

  return (
    <div className="focus-score-explanation">
      {showStatus && <p>{status}</p>}
      {period.partialMetricPeriod && period.metricStartKey && (
        <p>This score starts on {period.metricStartKey}, when exact Deep Focus measurement became available. Earlier sessions are not mixed into it.</p>
      )}
      {!warningsOnly && period.range !== 'day' && period.score != null && (
        <p>This period is scored against {period.referenceWorkdays === 1 ? 'one weekday' : `${period.referenceWorkdays} weekdays`} so far. Weekend work still counts.</p>
      )}
      {!warningsOnly && scoreUsesPartialFocusTime && (
        <p>Focus Score uses {formatMinutes(scoreMeasuredSeconds / 60)} of {formatMinutes(totalFocusSeconds / 60)} Focus Time. Only qualifying measured time enters the score; other active time remains visible and is not guessed.</p>
      )}
      {time?.measurementWarning && (
        <p>Only {Math.round(time.measurementCoverage * 100)}% of Focus Time could be measured. Focus Score uses the measured time only; missing camera data is not guessed.</p>
      )}
      {time?.measurementCoverageUnknown && (
        <p>Camera coverage is unavailable for part of this Focus Time because some earlier sessions did not store it.</p>
      )}
      {!warningsOnly && <details>
        <summary>How this score works</summary>
        <FocusScoreMethod />
      </details>}
    </div>
  )
}
