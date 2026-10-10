import BetaAccess from './BetaAccess'

// The access step on its own, for a returning user without current access
// (signed out, waitlisted, lapsed, offline too long). Same ground and glow as
// the onboarding so the two read as one place.
export default function AccessScreen(props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, overflowX: 'hidden', overflowY: 'auto',
      background: 'var(--ds-bg)', fontFamily: 'var(--ds-font)',
      display: 'flex', flexDirection: 'column', padding: '32px 24px',
    }}>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 620, height: 620, borderRadius: '50%', opacity: 0.6,
          background: 'radial-gradient(circle, rgba(122,152,255,0.85) 0%, rgba(14,22,44,0.35) 40%, transparent 70%)',
        }} />
      </div>
      <div style={{ position: 'relative', margin: 'auto', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <BetaAccess {...props} />
      </div>
    </div>
  )
}
