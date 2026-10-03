import { useEffect, useState } from 'react'

const ITEMS = [
  ['lab', 'Lab'],
  ['session-setup', 'Session'],
  ['setup', 'Workspace'],
  ['ai-companion', 'AI Companion'],
  ['analytics', 'Analytics'],
]

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  // Menu-bar style: "Sat 3 Oct 18:39". Ticking seconds pulled the eye.
  const date = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return <span className="app-shell-clock" aria-label={`${date}, ${time}`}>{date}<b>{time}</b></span>
}

export default function AppShell({ active, onNavigate, onLegal, utility, children }) {
  return (
    <div className="app-shell">
      <header className="app-shell-header">
        <button className="app-shell-brand" type="button" onClick={() => onNavigate('lab')}>Eudaimonai</button>
        <nav className="app-shell-nav" aria-label="Main navigation">
          {ITEMS.map(([id, label]) => {
            const disabled = id === 'ai-companion'
            return (
              <button
                key={id}
                type="button"
                className={`app-shell-nav-item${active === id ? ' is-active' : ''}`}
                onClick={() => !disabled && onNavigate(id)}
                disabled={disabled}
                aria-current={active === id ? 'page' : undefined}
                title={disabled ? 'AI Companion — coming later' : undefined}
              >
                {label}{disabled && <span className="app-shell-soon">Soon</span>}
              </button>
            )
          })}
        </nav>
        <div className="app-shell-utilities">
          <Clock />
          {onLegal && <button type="button" className="app-shell-nav-item" onClick={onLegal}>Legal</button>}
          {utility}
        </div>
      </header>
      <div className="app-shell-body">{children}</div>
    </div>
  )
}
