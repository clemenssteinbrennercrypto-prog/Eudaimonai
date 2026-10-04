import { useEffect, useRef } from 'react'

// Adds a Go menu (⌘1–⌘5, ⌘N) and a Legal item under Help to the native macOS
// menu bar. It starts from Tauri's default menu so the standard Edit menu
// (copy, paste, undo) keeps working inside text fields. Outside the native
// app, or if any menu call fails, it does nothing: the sidebar and the
// in-page shortcuts still cover every action.
const GO_ITEMS = [
  ['lab', 'Lab', 'CmdOrCtrl+1'],
  ['session-setup', 'Session', 'CmdOrCtrl+2'],
  ['setup', 'Workspace', 'CmdOrCtrl+3'],
  ['focus-apps', 'Protection', 'CmdOrCtrl+4'],
  ['analytics', 'Analytics', 'CmdOrCtrl+5'],
]

export function useNativeAppMenu({ onNavigate, onLegal, enabled }) {
  const handlers = useRef({ onNavigate, onLegal, enabled })
  handlers.current = { onNavigate, onLegal, enabled }
  const installed = useRef(false)

  useEffect(() => {
    if (!enabled || installed.current) return
    const api = typeof window !== 'undefined' ? window.__TAURI__?.menu : null
    if (!api?.Menu?.default || !api.Submenu || !api.MenuItem) return
    installed.current = true
    const go = id => () => {
      if (handlers.current.enabled) handlers.current.onNavigate(id)
    }
    ;(async () => {
      const menu = await api.Menu.default()
      const goItems = await Promise.all([
        api.MenuItem.new({ id: 'go-new-session', text: 'New Session', accelerator: 'CmdOrCtrl+N', action: go('session-setup') }),
        ...GO_ITEMS.map(([id, text, accelerator]) => api.MenuItem.new({ id: `go-${id}`, text, accelerator, action: go(id) })),
      ])
      // Toggle Sidebar mirrors ⌃⌘S. If this platform rejects the accelerator,
      // keep the item without it rather than losing the whole Go menu.
      const toggleSidebar = () => window.dispatchEvent(new Event('eudaimonai:toggle-sidebar'))
      const sidebarItem = await api.MenuItem.new({ id: 'go-toggle-sidebar', text: 'Toggle Sidebar', accelerator: 'Cmd+Ctrl+S', action: toggleSidebar })
        .catch(() => api.MenuItem.new({ id: 'go-toggle-sidebar', text: 'Toggle Sidebar', action: toggleSidebar }))
      goItems.push(sidebarItem)
      const goMenu = await api.Submenu.new({ text: 'Go', items: goItems })
      const items = await menu.items()
      const titles = await Promise.all(items.map(item => (typeof item.text === 'function' ? item.text() : '')))
      const windowIndex = titles.indexOf('Window')
      if (windowIndex >= 0) await menu.insert(goMenu, windowIndex)
      else await menu.append(goMenu)
      const helpIndex = titles.indexOf('Help')
      if (helpIndex >= 0) {
        const legal = await api.MenuItem.new({ id: 'help-legal', text: 'Legal Notice & Privacy', action: () => handlers.current.onLegal() })
        await items[helpIndex].append(legal)
      }
      await menu.setAsAppMenu()
    })().catch(() => {
      // Presentation only: a failed menu never affects the app.
    })
  }, [enabled])
}
