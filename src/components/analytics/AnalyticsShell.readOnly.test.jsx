/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const repository = vi.hoisted(() => ({
  loadAll: vi.fn(),
  loadFocusLedger: vi.fn(),
  deleteSession: vi.fn(),
  clearAll: vi.fn(),
  updateSession: vi.fn(),
  restoreArchive: vi.fn(),
  exportArchive: vi.fn(),
}))
vi.mock('../../lib/sessionRepository', () => ({ sessionRepository: repository }))

import AnalyticsShell from './AnalyticsShell'

const day = n => new Date(Date.UTC(2026, 9, n, 9)).getTime()
const sessions = [1, 2].map(n => ({
  id: `s${n}`, timestamp: day(n), task: `Thesis chapter ${n}`,
  actualSeconds: 1800, focusedSeconds: 1500, measuredSeconds: 1800, completed: true, timeline: [],
}))

beforeEach(() => {
  Object.values(repository).forEach(fn => fn.mockReset())
  repository.loadAll.mockResolvedValue(sessions)
  repository.loadFocusLedger.mockResolvedValue(null)
})
afterEach(cleanup)

// Decision (b): without beta access, history is strictly read-only. The
// shell refuses every write before it reaches the repository.
describe('Analytics in read-only mode', () => {
  it('shows the history but not the outcome prompts', async () => {
    render(<AnalyticsShell readOnly />)
    expect(await screen.findAllByText(/Thesis chapter 2/)).not.toHaveLength(0)
    expect(screen.queryByText('How did these sessions go?')).not.toBeInTheDocument()
  })

  it('refuses deleting a session without touching the database', async () => {
    render(<AnalyticsShell readOnly />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Thesis chapter 2' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete session' }))
    expect((await screen.findAllByRole('alert')).map(a => a.textContent).join(' ')).toMatch(/read-only/i)
    expect(repository.deleteSession).not.toHaveBeenCalled()
  })

  it('refuses clearing all history without touching the database', async () => {
    render(<AnalyticsShell readOnly />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Clear all history' }))[0])
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete all history' }))
    expect((await screen.findAllByRole('alert')).map(a => a.textContent).join(' ')).toMatch(/read-only/i)
    expect(repository.clearAll).not.toHaveBeenCalled()
  })

  it('still lets an entitled user rate sessions', async () => {
    repository.updateSession.mockResolvedValue({})
    render(<AnalyticsShell />)
    expect(await screen.findByText('How did these sessions go?')).toBeInTheDocument()
  })
})
