import { useEffect, useRef, useState } from 'react'

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

// Collapsed or not is a per-device view preference, like Finder's sidebar.
// Storage can be unavailable (private window, blocked site data): the
// sidebar then simply starts expanded.
export const SIDEBAR_COLLAPSED_KEY = 'eudaimonai_sidebar_collapsed'
export const TOGGLE_SIDEBAR_EVENT = 'eudaimonai:toggle-sidebar'

function readCollapsed() {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true' } catch { return false }
}

function SidebarGlyph() {
  return (
    <svg className="ds-icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M6 2.75v10.5M3.5 5.5h1M3.5 7.5h1" />
    </svg>
  )
}

function Glyph({ id }) {
  return <svg className="ds-icon" viewBox="0 0 16 16" aria-hidden="true">{ICONS[id]}</svg>
}

// A macOS source-list window: translucent sidebar under the traffic lights,
// content to the right. data-tauri-drag-region makes the empty sidebar top
// and the toolbar drag the window, as a native title bar would.
export default function AppShell({ active, onNavigate, onLegal, utility, footer, protectionStatus, children }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  // Whether the collapsed rail is temporarily showing the full sidebar.
  // Driven from JS, not CSS :hover/:has: WebKit (the macOS app's engine) did
  // not reliably re-evaluate those selectors on the items, leaving a mix of
  // rail and full rows while the pointer moved over the sidebar.
  const [peek, setPeek] = useState(false)
  const peekTimer = useRef(null)
  const schedulePeek = (next, delay) => {
    window.clearTimeout(peekTimer.current)
    peekTimer.current = window.setTimeout(() => setPeek(next), delay)
  }
  useEffect(() => () => window.clearTimeout(peekTimer.current), [])
  useEffect(() => { if (!collapsed) setPeek(false) }, [collapsed])
  const toggleSidebar = () => setCollapsed(current => {
    const next = !current
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next)) } catch { /* view preference only */ }
    return next
  })

  // ⌃⌘S and View > Toggle Sidebar, as in Finder, Mail and Notes.
  useEffect(() => {
    const onToggle = () => toggleSidebar()
    const onKey = event => {
      if (event.metaKey && event.ctrlKey && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener(TOGGLE_SIDEBAR_EVENT, onToggle)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener(TOGGLE_SIDEBAR_EVENT, onToggle)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

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
    <div className={`app-shell${collapsed ? ' is-sidebar-collapsed' : ''}${collapsed && peek ? ' is-sidebar-peek' : ''}`}>
      <aside
        className="app-sidebar"
        aria-label="Eudaimonai"
        // Hover intent: a pointer just passing over the rail on its way to
        // the window edge does not open it, and a brief overshoot past the
        // open panel does not snap it shut.
        onMouseEnter={() => collapsed && schedulePeek(true, 200)}
        onMouseLeave={() => collapsed && schedulePeek(false, 220)}
        onFocus={event => {
          if (collapsed && event.target.matches?.(':focus-visible')) schedulePeek(true, 0)
        }}
        onBlur={event => {
          if (collapsed && !event.currentTarget.contains(event.relatedTarget)) schedulePeek(false, 0)
        }}
      >
        <div className="app-sidebar-titlebar" data-tauri-drag-region>
          <button
            type="button"
            className="app-sidebar-toggle"
            onClick={toggleSidebar}
            aria-pressed={!collapsed}
            aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
            title={`${collapsed ? 'Show' : 'Hide'} sidebar (⌃⌘S)`}
          >
            <SidebarGlyph />
          </button>
        </div>
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
