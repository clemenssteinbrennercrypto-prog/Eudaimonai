import { useEffect } from 'react'

// SF Symbols-style line glyphs for the sidebar (16px grid, 1.5px stroke).
const ICONS = {
  lab: <><circle cx="8" cy="8" r="6.25" /><circle cx="8" cy="8" r="3.25" /><circle cx="8" cy="8" r=".6" /></>,
  'session-setup': <><circle cx="8" cy="8.75" r="5.5" /><path d="M8 5.75V8.75L10 10.25M6.5 1.75h3" /></>,
  setup: <><rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" /><path d="M8 11.25v2.5M5.5 13.75h5" /></>,
  'focus-apps': <><path d="M8 1.75 13.25 3.75v4c0 3-2.25 5.25-5.25 6.5C5 13 2.75 10.75 2.75 7.75v-4z" /></>,
  analytics: <><path d="M2.25 13.75h11.5" /><path d="M4.25 11.25V8M8 11.25V4.25M11.75 11.25V6.5" /></>,
  'ai-companion': <><path d="M8 2.25 9.25 6 13 7.25 9.25 8.5 8 12.25 6.75 8.5 3 7.25 6.75 6z" /></>,
}

// Order matches the ⌘1–⌘5 shortcuts and the Go menu.
export const NAV_ITEMS = [
  { id: 'lab', label: 'Lab', key: '1' },
  { id: 'session-setup', label: 'Session', key: '2' },
  { id: 'setup', label: 'Workspace', key: '3' },
  { id: 'focus-apps', label: 'Protection', key: '4' },
  { id: 'analytics', label: 'Analytics', key: '5' },
  { id: 'ai-companion', label: 'AI Companion', soon: true },
]

function Glyph({ id }) {
  return <svg className="ds-icon" viewBox="0 0 16 16" aria-hidden="true">{ICONS[id]}</svg>
}

// A macOS source-list window: translucent sidebar under the traffic lights,
// content to the right. data-tauri-drag-region makes the empty sidebar top
// and the toolbar drag the window, as a native title bar would.
export default function AppShell({ active, onNavigate, onLegal, utility, footer, protectionStatus, children }) {
  useEffect(() => {
    const onKeyDown = event => {
      if (!event.metaKey || event.altKey || event.ctrlKey) return
      const target = event.target
      const typing = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      const item = NAV_ITEMS.find(entry => entry.key === event.key)
      if (item) {
        event.preventDefault()
        onNavigate(item.id)
      } else if (event.key.toLowerCase() === 'n' && !event.shiftKey && !typing) {
        event.preventDefault()
        onNavigate('session-setup')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onNavigate])

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="Eudaimonai">
        <div className="app-sidebar-titlebar" data-tauri-drag-region />
        <div className="app-sidebar-brand" data-tauri-drag-region>
          <img src="./app-icon-64.png" alt="" width="22" height="22" />
          <span>Eudaimonai</span>
        </div>
        <nav className="app-sidebar-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              className={`app-sidebar-item${active === item.id ? ' is-active' : ''}`}
              onClick={() => !item.soon && onNavigate(item.id)}
              disabled={item.soon}
              aria-current={active === item.id ? 'page' : undefined}
              title={item.soon ? 'AI Companion — coming later' : `${item.label} (⌘${item.key})`}
            >
              <Glyph id={item.id} />
              <span>{item.label}</span>
              {item.id === 'focus-apps' && protectionStatus && (
                <i className={`app-sidebar-status is-${protectionStatus.tone}`} aria-label={protectionStatus.label} title={protectionStatus.label} />
              )}
              {item.soon && <em>Soon</em>}
            </button>
          ))}
        </nav>
        <div className="app-sidebar-footer">
          {utility}
          <div className="app-sidebar-meta">
            {onLegal && <button type="button" className="app-sidebar-link" onClick={onLegal}>Legal</button>}
            {footer}
          </div>
        </div>
      </aside>
      <div className="app-main">
        <div className="app-main-titlebar" data-tauri-drag-region />
        {children}
      </div>
    </div>
  )
}
