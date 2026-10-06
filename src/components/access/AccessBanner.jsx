// One quiet line above the app's content when beta access needs a word:
// browsing history read-only, or running on the offline grace.
function formatUntil(ms) {
  return new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function AccessBanner({ status, readOnly, onSignIn }) {
  let text = null
  let action = null
  if (readOnly) {
    text = 'Read-only: you can view and export your history. Starting a session needs beta access.'
    action = 'Sign in'
  } else if (status?.source === 'offline_grace' && status.untilMs) {
    text = `Offline. Sessions keep working until ${formatUntil(status.untilMs)}, then Eudaimonai needs to check your access online.`
  }
  if (!text) return null
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      margin: '0 0 12px', padding: '10px 14px', borderRadius: 12,
      border: '1px solid var(--ds-hairline-strong)', background: 'var(--ds-fill)',
      fontSize: 13, lineHeight: 1.5, color: 'var(--ds-label-2)',
    }}>
      <span>{text}</span>
      {action && (
        <button type="button" className="ds-button-secondary" onClick={onSignIn} style={{ flex: 'none' }}>{action}</button>
      )}
    </div>
  )
}
