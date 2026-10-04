/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest"
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import AppShell from './AppShell'

describe('app shell legal entry point', () => {
  it('renders an in-app Legal control when provided', () => {
    const output = renderToString(React.createElement(AppShell, {
      active: 'lab',
      onNavigate: vi.fn(),
      onLegal: vi.fn(),
      utility: null,
      children: React.createElement('main', null, 'content'),
    }))
    expect(output).toContain('>Legal</button>')
  })
})

describe('collapsible sidebar', () => {
  it('hides and shows the sidebar from its toggle and remembers the choice', async () => {
    const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
    const store = new Map()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) },
    })
    const props = { active: 'lab', onNavigate: vi.fn(), children: React.createElement('main', null, 'content') }
    const view = render(React.createElement(AppShell, props))
    fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }))
    expect(view.container.querySelector('.app-shell')).toHaveClass('is-sidebar-collapsed')
    expect(store.get('eudaimonai_sidebar_collapsed')).toBe('true')
    cleanup()

    render(React.createElement(AppShell, props))
    expect(screen.getByRole('button', { name: 'Show sidebar' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 's', metaKey: true, ctrlKey: true })
    expect(screen.getByRole('button', { name: 'Hide sidebar' })).toBeInTheDocument()
    expect(store.get('eudaimonai_sidebar_collapsed')).toBe('false')
  })

  it('starts expanded when storage is unavailable', async () => {
    const { render, screen, cleanup } = await import('@testing-library/react')
    cleanup()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('blocked') },
    })
    render(React.createElement(AppShell, { active: 'lab', onNavigate: vi.fn(), children: null }))
    expect(screen.getByRole('button', { name: 'Hide sidebar' })).toBeInTheDocument()
  })
})
