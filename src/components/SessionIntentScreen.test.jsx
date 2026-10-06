/** @vitest-environment jsdom */
import React from 'react'
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import SessionIntentScreen from './SessionIntentScreen'

class MemoryStorage {
  constructor() { this.values = new Map() }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

function renderIntent(overrides = {}) {
  const noop = () => {}
  return renderToString(React.createElement(SessionIntentScreen, {
    task: '', setTask: noop,
    goal: '', setGoal: noop,
    duration: 30, setDuration: noop,
    energyLevel: 'medium', setEnergyLevel: noop,
    tags: [], setTags: noop,
    onStart: noop,
    ...overrides,
  })).replaceAll('<!-- -->', '')
}

const CONNECTED = { checked: true, connected: true, helperInstalled: true }

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  })
})

afterEach(cleanup)

describe('SessionIntentScreen', () => {
  it('is an intent briefing and does not display a focus metric', () => {
    const html = renderIntent()
    expect(html).toContain('New Session')
    expect(html).toContain('Definition of plan')
    expect(html).toContain('1000 words')
    expect(html).toContain('aria-labelledby="session-plan-field-label"')
    expect(html).not.toContain('Focus Score')
    expect(html).toContain('disabled=""')
  })

  it('offers custom and unlimited sessions with an unmistakable start action', () => {
    const html = renderIntent({ task: 'Current task', duration: null })
    expect(html).toContain('Custom')
    expect(html).toContain('No limit')
    expect(html).toContain('Start focus session')
    expect(html).toContain('▶')
  })

  it('connects the workspace explanation to its clean select control', () => {
    const html = renderIntent({
      workspaces: [{ id: 'desk', name: 'Desk' }],
      activeWorkspaceId: 'desk',
    })

    expect(html).toContain('session-select-control')
    expect(html).toContain('id="session-workspace-help"')
    expect(html).toContain('aria-describedby="session-workspace-help"')
  })

  it('names the active setup and starts a protected session only when rules can be enforced', () => {
    const html = renderIntent({
      task: 'Current task',
      protectionEnabled: true,
      protectionSetup: { name: 'Writing', distractionApps: ['Slack'], distractionDomains: [], strictMode: false },
      nativeStatus: CONNECTED,
      onEditProtection: () => {},
    })

    expect(html).toContain('Writing · protected')
    expect(html).toContain('1 distraction unavailable during this session')
    expect(html).toContain('Start protected session')
  })

  describe('protection claims follow the Companion', () => {
    const writing = { name: 'Writing', distractionApps: ['Slack'], distractionDomains: [], strictMode: false }
    const render = overrides => renderIntent({ task: 'Current task', protectionEnabled: true, protectionSetup: writing, onEditProtection: () => {}, ...overrides })

    it('never claims protection before the Companion has been checked', () => {
      const html = render({ nativeStatus: { checked: false, connected: false, helperInstalled: false } })
      expect(html).toContain('Writing · checking Companion')
      expect(html).not.toContain('protected')
      expect(html).toContain('Start focus session')
    })

    it('reports a missing Companion instead of a protected session', () => {
      const html = render({ nativeStatus: { checked: true, connected: false, helperInstalled: false } })
      expect(html).toContain('Writing · Companion not connected')
      expect(html).toContain('nothing is enforced until the Companion app is running')
      expect(html).not.toContain('Start protected session')
      expect(html).toContain('>Edit<')
    })

    it('requires the website helper only when websites are blocked', () => {
      const websites = { ...writing, distractionApps: ['YouTube'], distractionDomains: ['youtube.com'] }
      const withoutHelper = render({ protectionSetup: websites, nativeStatus: { checked: true, connected: true, helperInstalled: false } })
      expect(withoutHelper).toContain('Writing · website helper required')
      expect(withoutHelper).not.toContain('Start protected session')

      const appsOnly = render({ nativeStatus: { checked: true, connected: true, helperInstalled: false } })
      expect(appsOnly).toContain('Start protected session')
    })

    it('does not claim any protection when the Companion lacks System Events access', () => {
      const denied = { ...CONNECTED, missingPermissions: [{ name: 'System Events', scope: 'system' }] }
      const html = render({ nativeStatus: denied })
      expect(html).toContain('Writing · permission required')
      expect(html).toContain('Nothing is enforced until the Companion has Automation access for System Events.')
      expect(html).not.toContain('Start protected session')

      const websiteOnly = render({ protectionSetup: { ...writing, distractionApps: ['reddit.com'], distractionDomains: ['reddit.com'] }, nativeStatus: denied })
      expect(websiteOnly).not.toContain('Start protected session')
    })

    it('limits a browser permission gap to website protection', () => {
      const denied = { ...CONNECTED, missingPermissions: [{ name: 'Safari', scope: 'browser' }] }
      expect(render({ nativeStatus: denied })).toContain('Start protected session')

      const websiteOnly = render({ protectionSetup: { ...writing, distractionApps: ['reddit.com'], distractionDomains: ['reddit.com'] }, nativeStatus: denied })
      expect(websiteOnly).toContain('Writing · permission required')
      expect(websiteOnly).toContain('Blocked websites can&#x27;t be closed in Safari until the Companion has Automation access.')
      expect(websiteOnly).not.toContain('Start protected session')
    })

    it('treats strict mode without a blocklist as protection once the Companion is connected', () => {
      const html = render({ protectionSetup: { name: 'Deep', distractionApps: [], distractionDomains: [], strictMode: true }, nativeStatus: CONNECTED })
      expect(html).toContain('Deep · protected')
      expect(html).toContain('Strict protection · unlisted apps hidden · 0 selected distractions unavailable')
    })

    it('does not call an allowed-only setup protected, even with the Companion connected', () => {
      const html = render({ protectionSetup: { name: 'Tools', focusApps: ['VS Code'], distractionApps: [], distractionDomains: [], strictMode: false }, nativeStatus: CONNECTED })
      expect(html).toContain('Not configured')
      expect(html).toContain('>Set up<')
      expect(html).toContain('Start focus session')
    })

    it('says protection is off whatever the Companion reports', () => {
      const html = render({ protectionEnabled: false, nativeStatus: CONNECTED })
      expect(html).toContain('Protection off')
      expect(html).toContain('Start focus session')
    })
  })

  it('offers direct setup selection when more than one protection setup exists', () => {
    const html = renderIntent({
      task: 'Current task',
      protectionEnabled: true,
      protectionSetup: { id: 'writing', name: 'Writing', distractionApps: ['Reddit'] },
      protectionSetups: [
        { id: 'writing', name: 'Writing' },
        { id: 'study', name: 'Study' },
      ],
      onProtectionSetupChange: () => {},
    })

    expect(html).toContain('aria-label="Protection setup"')
    // A pop-up button: options render when it opens (DsSelect.test.jsx).
    expect(html).toContain('aria-haspopup="listbox"')
    expect(html).toContain('>Writing</span>')
  })

  describe('protection activation at session start', () => {
    const renderStart = (overrides = {}) => {
      const onStart = vi.fn()
      const onEditProtection = vi.fn()
      const noop = () => {}
      render(React.createElement(SessionIntentScreen, {
        task: 'Current task', setTask: noop,
        goal: '', setGoal: noop,
        duration: 30, setDuration: noop,
        energyLevel: 'medium', setEnergyLevel: noop,
        tags: [], setTags: noop,
        nativeStatus: CONNECTED,
        onStart,
        onEditProtection,
        ...overrides,
      }))
      return { onStart, onEditProtection }
    }

    it('asks before starting when Protection is off and keeps the unprotected path explicit', () => {
      const { onStart, onEditProtection } = renderStart({ protectionEnabled: false })

      fireEvent.click(screen.getByRole('button', { name: /Start focus session/ }))

      expect(onStart).not.toHaveBeenCalled()
      const dialog = screen.getByRole('dialog', { name: 'Start without active Protection?' })
      expect(within(dialog).getByText(/No distractions will be blocked/)).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Open Protection' })).toHaveFocus()

      fireEvent.click(within(dialog).getByRole('button', { name: 'Continue without Protection' }))
      expect(onStart).toHaveBeenCalledOnce()
      expect(onEditProtection).not.toHaveBeenCalled()
    })

    it('opens the existing setup instead of starting an empty protected session', () => {
      const { onStart, onEditProtection } = renderStart({
        protectionEnabled: true,
        protectionSetup: { name: 'Deep Work', distractionApps: [], distractionDomains: [], strictMode: false },
      })

      fireEvent.click(screen.getByRole('button', { name: /Start focus session/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Set up Protection' }))

      expect(onEditProtection).toHaveBeenCalledOnce()
      expect(onStart).not.toHaveBeenCalled()
    })

    it('does not claim every safeguard is absent when only website enforcement is incomplete', () => {
      renderStart({
        protectionEnabled: true,
        protectionSetup: { name: 'Writing', distractionApps: ['YouTube'], distractionDomains: ['youtube.com'], strictMode: false },
        nativeStatus: { checked: true, connected: true, helperInstalled: false },
      })

      fireEvent.click(screen.getByRole('button', { name: /Start focus session/ }))

      const dialog = screen.getByRole('dialog', { name: 'Start before Protection is ready?' })
      expect(within(dialog).getByText(/full Protection setup cannot be verified or enforced/)).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Continue anyway' })).toBeInTheDocument()
      expect(within(dialog).queryByText(/No distractions will be blocked/)).not.toBeInTheDocument()
    })

    it('starts immediately when the selected setup is ready', () => {
      const { onStart } = renderStart({
        protectionEnabled: true,
        protectionSetup: { name: 'Writing', distractionApps: ['Slack'], distractionDomains: [], strictMode: false },
      })

      fireEvent.click(screen.getByRole('button', { name: /Start protected session/ }))

      expect(onStart).toHaveBeenCalledOnce()
      expect(screen.queryByRole('dialog', { name: 'Start without active Protection?' })).not.toBeInTheDocument()
    })
  })

  describe('energy', () => {
    const renderEnergy = (overrides = {}) => {
      const setEnergyLevel = vi.fn()
      const noop = () => {}
      render(React.createElement(SessionIntentScreen, {
        task: 'Current task', setTask: noop,
        goal: '', setGoal: noop,
        duration: 30, setDuration: noop,
        energyLevel: null, setEnergyLevel,
        tags: [], setTags: noop,
        onStart: noop,
        ...overrides,
      }))
      return { setEnergyLevel }
    }

    it('shows no level as chosen until the user picks one', () => {
      renderEnergy()
      for (const name of ['Fresh', 'Medium', 'Tired']) {
        expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
      }
    })

    it('clears the chosen level when it is clicked again', () => {
      const { setEnergyLevel } = renderEnergy({ energyLevel: 'tired' })
      fireEvent.click(screen.getByRole('button', { name: 'Tired' }))
      expect(setEnergyLevel).toHaveBeenLastCalledWith(null)
      fireEvent.click(screen.getByRole('button', { name: 'Fresh' }))
      expect(setEnergyLevel).toHaveBeenLastCalledWith('fresh')
    })

    it('does not copy energy from a reused setup', () => {
      const { setEnergyLevel } = renderEnergy({
        recentSessions: [{ task: 'Draft essay', goal: '', duration: 60, tags: [], energyLevel: 'tired' }],
      })
      fireEvent.click(screen.getByRole('button', { name: /Draft essay/ }))
      expect(setEnergyLevel).not.toHaveBeenCalled()
    })
  })

  describe('project folder', () => {
    const renderFolder = (overrides = {}) => {
      const noop = () => {}
      const onChooseOutputFolder = vi.fn()
      const onClearOutputFolder = vi.fn()
      render(React.createElement(SessionIntentScreen, {
        task: 'Current task', setTask: noop,
        goal: '', setGoal: noop,
        duration: 30, setDuration: noop,
        energyLevel: null, setEnergyLevel: noop,
        tags: [], setTags: noop,
        onStart: noop,
        onChooseOutputFolder,
        onClearOutputFolder,
        ...overrides,
      }))
      return { onChooseOutputFolder, onClearOutputFolder }
    }

    it('is not offered where no folder picker exists', () => {
      renderFolder({ onChooseOutputFolder: null })
      expect(screen.queryByText('Project folder')).not.toBeInTheDocument()
    })

    it('offers a choice and says that contents are never read', () => {
      const { onChooseOutputFolder } = renderFolder({ outputFolder: '' })
      expect(screen.getByText('None chosen')).toBeInTheDocument()
      expect(screen.getByText(/never reads file contents/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Choose' }))
      expect(onChooseOutputFolder).toHaveBeenCalledOnce()
    })

    it('names the chosen folder and lets it be changed or removed', () => {
      const { onChooseOutputFolder, onClearOutputFolder } = renderFolder({ outputFolder: '/Users/me/Code/thesis/' })
      expect(screen.getByText('thesis')).toHaveAttribute('title', '/Users/me/Code/thesis/')
      fireEvent.click(screen.getByRole('button', { name: 'Change' }))
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
      expect(onChooseOutputFolder).toHaveBeenCalledOnce()
      expect(onClearOutputFolder).toHaveBeenCalledOnce()
    })
  })

  it('reuses honest fields from recent session history', () => {
    // History arrives as a prop — App owns loading it from the repository.
    const html = renderIntent({
      task: 'Current task',
      recentSessions: [{
        task: 'Draft essay',
        goal: 'Write 800 words',
        duration: 60,
        tags: ['Writing'],
        energyLevel: 'fresh',
      }],
    })
    expect(html).toContain('Draft essay')
    expect(html).toContain('Write 800 words')
    expect(html).toContain('1h')
    expect(html).toContain('<button class="session-intent-start" type="button">')
  })
})
