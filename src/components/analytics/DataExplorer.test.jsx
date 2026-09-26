/* @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DataExplorer from './DataExplorer'

afterEach(cleanup)

function session(index, extra = {}) {
  const actualSeconds = 30 * 60
  const timestamp = new Date(2026, 8, 1 + index, index < 4 ? 10 : 16).getTime()
  const average = extra.avgFocusScore ?? (index < 4 ? 84 : 52)
  return {
    id: `s-${index}`,
    timestamp,
    actualSeconds,
    measuredSeconds: actualSeconds,
    focusedSeconds: Math.round(actualSeconds * 0.7),
    scoreSum: average * actualSeconds,
    avgFocusScore: average,
    scoreMeasured: true,
    attentionScoringVersion: 2,
    goalOutcome: index % 3 === 0 ? 'no' : 'yes',
    workspace: index < 4
      ? { id: 'office', name: 'Office', revision: 1 }
      : { id: 'home', name: 'Home', revision: 1 },
    focusPhases: { seconds: { lock_in: 900, recovery: 180, drift: 120 } },
    ...extra,
  }
}

function renderExplorer(sessions, props = {}) {
  const onSelectSession = vi.fn()
  render(
    <DataExplorer
      sessions={sessions}
      selectedSessionId={null}
      onSelectSession={onSelectSession}
      onUpdateSession={vi.fn()}
      {...props}
    />,
  )
  return { onSelectSession }
}

describe('Analytics Details', () => {
  it('renders the agreed analysis story and removes speculative audit sections', () => {
    renderExplorer(Array.from({ length: 8 }, (_, index) => session(index)))

    expect(screen.getByRole('heading', { name: 'Focus by session' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Session average attention' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Where and when focus is strongest' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'How your sessions behave' })).toBeTruthy()
    const signals = [...document.querySelectorAll('.analytics-condition-signal')].map(node => node.textContent)
    expect(signals).toContain('Late morning records 32 points higher average attention than Afternoon.')
    expect(signals).toContain('Office records 32 points higher average attention than Home.')
    expect(screen.queryByText('Applied score components')).toBeNull()
    expect(screen.queryByText('Latest 8 vs previous 8')).toBeNull()
    expect(screen.queryByText('Energy context')).toBeNull()
    expect(screen.queryByText('Data quality')).toBeNull()
    expect(screen.queryByText('Activity alignment')).toBeNull()
  })

  it('keeps one dataset behind the outcome filter and offers a reset', () => {
    renderExplorer([
      session(1, { goalOutcome: 'yes' }),
      session(2, { goalOutcome: 'no' }),
      session(3, { goalOutcome: null }),
    ])

    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'no' } })
    expect(screen.getByText('session · 1 measured')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy()
    const outcomes = within(screen.getByLabelText('Outcomes across 1 session'))
    expect(outcomes.getByText('Missed').parentElement?.textContent).toContain('1')
    expect(outcomes.getByText('Reached').parentElement?.textContent).toContain('0')
  })

  it('opens the existing session detail from a plotted point', () => {
    const { onSelectSession } = renderExplorer([session(1), session(2), session(3)])
    fireEvent.click(screen.getAllByRole('button', { name: /Open session details/ })[0])
    expect(onSelectSession).toHaveBeenCalledWith('s-1')
  })

  it('saves an outcome from a session opened in Details with the correct signature', () => {
    const onUpdateSession = vi.fn()
    renderExplorer([session(1)], { selectedSessionId: 's-1', onUpdateSession })

    expect(screen.getByRole('button', { name: '← Details' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Partly' }))
    expect(onUpdateSession).toHaveBeenCalledWith('s-1', {
      goalOutcome: 'partly',
      goalAchieved: null,
    })
  })

  it('keeps missing measurement in a separate lane below the score scale', () => {
    renderExplorer([
      session(1),
      session(2, { scoreMeasured: false }),
    ])

    const missing = screen.getByRole('button', { name: /not measured.*Open session details/ })
    expect(missing.querySelector('circle')?.getAttribute('cy')).toBe('258')
    expect(document.querySelector('.analytics-unmeasured-axis')).toBeTruthy()
  })

  it('keeps the distribution viewBox stable when close values need more lanes', () => {
    renderExplorer(Array.from({ length: 12 }, (_, index) => session(index, { avgFocusScore: 70 })))
    const plot = screen.getByLabelText('Distribution of 12 sessions with measured averages')
    expect(plot.getAttribute('viewBox')).toBe('0 0 1000 128')
    expect(plot.querySelectorAll('.analytics-point-hit')).toHaveLength(5)
    expect(within(plot).getByLabelText('7 more sessions at 70 average attention; each remains available in Focus by session')).toBeTruthy()
  })

  it('keeps neighbouring distribution scores visually separable in each lane', () => {
    renderExplorer([
      ...Array.from({ length: 7 }, (_, index) => session(index, { avgFocusScore: 60 })),
      session(7, { avgFocusScore: 61 }),
    ])
    const plot = screen.getByLabelText('Distribution of 8 sessions with measured averages')
    const lanes = new Map()
    for (const mark of plot.querySelectorAll('.analytics-point-hit')) {
      const cy = mark.getAttribute('cy')
      if (!lanes.has(cy)) lanes.set(cy, [])
      lanes.get(cy).push(Number(mark.getAttribute('cx')))
    }
    for (const values of lanes.values()) {
      values.sort((a, b) => a - b)
      for (let index = 1; index < values.length; index += 1) {
        expect(values[index] - values[index - 1]).toBeGreaterThanOrEqual(9)
      }
    }
  })

  it('never moves a dense score cluster away from its measured value', () => {
    renderExplorer(Array.from({ length: 50 }, (_, index) => session(index, { avgFocusScore: 70 })))
    const plot = screen.getByLabelText('Distribution of 50 sessions with measured averages')
    const expectedX = 48 + 70 * 9.18
    for (const mark of plot.querySelectorAll('.analytics-point-hit')) {
      expect(Number(mark.getAttribute('cx'))).toBeCloseTo(expectedX)
    }
    expect(within(plot).getByLabelText('45 more sessions at 70 average attention; each remains available in Focus by session')).toBeTruthy()
  })

  it('merges nearby density labels instead of drawing them on top of each other', () => {
    renderExplorer([
      ...Array.from({ length: 50 }, (_, index) => session(index, { avgFocusScore: 70 })),
      ...Array.from({ length: 7 }, (_, index) => session(index + 50, { avgFocusScore: 71 })),
    ])
    const plot = screen.getByLabelText('Distribution of 57 sessions with measured averages')
    expect(plot.querySelectorAll('.analytics-distribution-overflow')).toHaveLength(1)
    expect(within(plot).getByLabelText('47 more sessions at 70–71 average attention; each remains available in Focus by session')).toBeTruthy()
  })

  it('uses the newest stored name for a renamed workspace filter', () => {
    renderExplorer([
      session(1, { workspace: { id: 'desk', name: 'Old desk', revision: 1 } }),
      session(2, { workspace: { id: 'desk', name: 'New desk', revision: 2 } }),
    ])

    const workspace = screen.getByLabelText('Workspace')
    expect(within(workspace).getByRole('option', { name: 'New desk' })).toBeTruthy()
    expect(within(workspace).queryByRole('option', { name: 'Old desk' })).toBeNull()
  })

  it('hides immature comparisons instead of rendering empty cards', () => {
    renderExplorer([session(1), session(2)])
    expect(screen.queryByRole('heading', { name: 'Where and when focus is strongest' })).toBeNull()
    expect(screen.getByText(/Stronger time and workspace comparisons appear after 6 more qualified sessions/)).toBeTruthy()
  })

  it('explains why mature history still lacks a second comparison bucket', () => {
    renderExplorer(Array.from({ length: 8 }, (_, index) => session(index, {
      timestamp: new Date(2026, 8, 1 + index, 10).getTime(),
      workspace: { id: 'office', name: 'Office', revision: 1 },
    })))

    expect(screen.queryByRole('heading', { name: 'Where and when focus is strongest' })).toBeNull()
    expect(screen.getByText('Time-of-day and workspace comparisons each need at least two groups with 3 qualified sessions.')).toBeTruthy()
  })
})
