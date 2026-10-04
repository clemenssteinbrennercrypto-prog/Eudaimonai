import MeasuredFacts from './sessionReport/MeasuredFacts'
import CheckIn from './sessionReport/CheckIn'
import SessionRead from './sessionReport/SessionRead'
import SessionDetails from './sessionReport/SessionDetails'

/**
 * The post-session debrief. Four ordered sections: Measured facts, Quick
 * check-in, Session read, Details. Historical sessions deliberately use a
 * shorter overview. Persistence goes through `onOutcomeChange`; there is no
 * storage import here.
 */
export default function SessionReport({
  session,
  analysis,
  onOutcomeChange,
  onPrimaryAction,
  onSecondaryAction,
  onRepeat,
}) {
  const showRead = analysis.status !== 'awaiting_outcome'

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <MeasuredFacts session={session} analysis={analysis} />
      <CheckIn session={session} analysis={analysis} onOutcomeChange={onOutcomeChange} />
      {showRead && <SessionRead analysis={analysis} />}
      <SessionDetails session={session} analysis={analysis} />

      {/* One primary (ultramarine) action, the rest quiet secondary pills of
          the same height, as everywhere else in the app. */}
      <div className="report-actions">
        {onSecondaryAction && (
          <button type="button" className="ds-button-secondary" onClick={onSecondaryAction}>
            New Session
          </button>
        )}
        {onRepeat && (
          <button type="button" className="ds-button-secondary" onClick={onRepeat}>
            Repeat Setup
          </button>
        )}
        <button type="button" className="ds-button-primary report-primary" onClick={onPrimaryAction}>
          Continue to Analytics
        </button>
      </div>
    </div>
  )
}
