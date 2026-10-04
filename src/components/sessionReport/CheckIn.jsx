import { useState } from 'react'
import { GOAL_OUTCOMES } from './constants'

/**
 * The one required interaction in the post-session flow: did you reach the
 * goal? The note field adapts to the answer — "what did you complete" only
 * makes sense for a "yes", "what got in the way" only for "partly"/"no" — and
 * is always optional, unlike the outcome itself.
 */
export default function CheckIn({ session, analysis, onOutcomeChange }) {
  // The chosen outcome is read straight off the analysis rather than copied
  // into local state: the owner above re-analyses after every change, so a
  // second copy here could only ever go stale. The note fields keep local
  // state because they are typed into and saved on blur.
  const selectedOutcome = analysis.goalOutcome
  const [completedText, setCompletedText] = useState(session.completedText || '')
  const [blockerText, setBlockerText] = useState(session.blockerText || '')

  const selectOutcome = (nextOutcome) => {
    onOutcomeChange({
      goalOutcome: nextOutcome,
      goalAchieved: nextOutcome === 'yes' ? true : nextOutcome === 'no' ? false : null,
    })
  }

  const noteIsForCompletion = selectedOutcome === 'yes'
  const noteLabel = noteIsForCompletion ? 'What did you complete?' : 'What got in the way?'
  const noteValue = noteIsForCompletion ? completedText : blockerText
  const setNoteValue = noteIsForCompletion ? setCompletedText : setBlockerText
  const saveNote = () => onOutcomeChange(noteIsForCompletion
    ? { completedText: completedText.trim() }
    : { blockerText: blockerText.trim() })

  return (
    <div className="report-checkin">
      <p className="report-checkin-kicker">
        Quick check-in <span>(required)</span>
      </p>
      <p className="report-checkin-question">
        {session.goal ? `Did you get there: ${session.goal}?` : 'Did you reach your goal?'}
      </p>
      <div className="report-checkin-options" style={{ marginBottom: selectedOutcome ? 14 : 0 }}>
        {GOAL_OUTCOMES.map(({ value, label, color }) => {
          const active = selectedOutcome === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => selectOutcome(value)}
              aria-pressed={active}
              className={active ? 'is-active' : ''}
              style={{ '--outcome-tone': color }}
            >
              {label}
            </button>
          )
        })}
      </div>
      {selectedOutcome && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
            {noteLabel} <span style={{ fontWeight: 400 }}>(optional)</span>
          </span>
          <input
            type="text"
            className="text-input"
            value={noteValue}
            onChange={(e) => setNoteValue(e.target.value.slice(0, 160))}
            onBlur={saveNote}
            placeholder="Short note"
            maxLength={160}
          />
        </label>
      )}
    </div>
  )
}
