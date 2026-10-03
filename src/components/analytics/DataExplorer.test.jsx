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
    deepFocusTimeVersion: 2,
    flowSeconds: 300,
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
    expect(screen.queryByRole('heading', { name: 'Session average attention' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Where and when focus is strongest' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'How your sessions behave' })).toBeTruthy()
    expect(screen.getByText('Deep Focus')).toBeTruthy()
    expect(within(screen.getByLabelText('Exact Deep Focus time')).getByText('40m')).toBeTruthy()
    const signals = [...document.querySelectorAll('.analytics-condition-signal')].map(node => node.textContent)
    expect(signals).toContain('Late morning records 32 points higher average attention than Afternoon.')
    expect(signals).toContain('Office records 32 points higher average attention than Home.')
    expect(screen.queryByText('Applied score components')).toBeNull()
    expect(screen.queryByText('Latest 8 vs previous 8')).toBeNull()
    expect(screen.queryByText('Energy context')).toBeNull()
    expect(screen.queryByText('Data quality')).toBeNull()
    expect(screen.queryByText('Activity alignment')).toBeNull()
  })

  it('explains chart encodings and provides navigation through the available evidence', () => {
    renderExplorer(Array.from({ length: 8 }, (_, index) => session(index)))

    const index = screen.getByRole('navigation', { name: 'Details sections' })
    expect(within(index).getByRole('button', { name: 'Sessions' })).toBeTruthy()
    expect(within(index).getByRole('button', { name: 'Conditions' })).toBeTruthy()
    expect(within(index).getByRole('button', { name: 'Rhythm' })).toBeTruthy()
    expect(screen.getByText('Only sessions with at least 10 minutes of reliable measurement are plotted. Earlier measurement methods remain a separate series; excluded sessions stay in history without crowding the chart.')).toBeTruthy()
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
    expect(document.querySelectorAll('.analytics-focus-point')).toHaveLength(1)
    expect(screen.queryByLabelText('Outcomes across 1 session')).toBeNull()
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

  it('keeps missing measurement out of the plot instead of creating a cluttered exclusion lane', () => {
    renderExplorer([
      session(1),
      session(2, { scoreMeasured: false }),
    ])

    expect(document.querySelectorAll('.analytics-focus-point')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /not measured.*Open session details/ })).toBeNull()
    expect(document.querySelector('.analytics-excluded-axis')).toBeNull()
    expect(screen.getByText('1 shown · 1 too short to plot')).toBeTruthy()
  })

  it('connects every eligible point in one measurement series without letting short sessions shape the line', () => {
    renderExplorer([
      session(1, { avgFocusScore: 80 }),
      session(2, { avgFocusScore: 20, actualSeconds: 9 * 60, measuredSeconds: 9 * 60, scoreSum: 20 * 9 * 60 }),
      session(3, { avgFocusScore: 70 }),
    ])

    const line = document.querySelector('.analytics-main-plot .analytics-series-line.is-current-generation')
    expect(line?.getAttribute('d')).toMatch(/^M [\d.]+ [\d.]+ C [^M]+$/)
    expect(document.querySelectorAll('.analytics-focus-point')).toHaveLength(2)
    expect(document.querySelector('.analytics-excluded-point')).toBeNull()
    expect(document.querySelector('.analytics-focus-point.is-reached')).toBeNull()
    expect(screen.getByText('2 shown · 1 too short to plot')).toBeTruthy()
  })

  it('keeps close-in-time sessions separately clickable and lets only plotted sessions set the time axis', () => {
    const first = new Date(2026, 8, 1, 10).getTime()
    renderExplorer([
      session(1, { timestamp: first }),
      session(2, { timestamp: first + 60_000 }),
      session(3, { timestamp: first + 10 * 86400000, actualSeconds: 5 * 60, measuredSeconds: 5 * 60 }),
    ])

    // jsdom has no layout, so the chart uses its 960px fallback width: the
    // plot runs from x=48 to x=930 and the excluded session must not stretch it.
    const marks = [...document.querySelectorAll('.analytics-focus-point-mark')]
    expect(marks).toHaveLength(2)
    expect(Number(marks[1].getAttribute('cx')) - Number(marks[0].getAttribute('cx'))).toBeGreaterThanOrEqual(32)
    expect(Number(marks[0].getAttribute('cx'))).toBe(48)
    expect(Number(marks[1].getAttribute('cx'))).toBe(930)
    expect(screen.getAllByText(/^Sep 1 · \d\d:\d\d$/).length).toBeGreaterThanOrEqual(2)
  })

  it('shows earlier measurement history as a separate series in the same style without joining the rulers', () => {
    renderExplorer([
      session(1, { timestamp: new Date(2026, 6, 20).getTime(), attentionScoringVersion: 1 }),
      session(2, { timestamp: new Date(2026, 7, 20).getTime(), attentionScoringVersion: 2 }),
    ])

    expect(document.querySelectorAll('.analytics-focus-point')).toHaveLength(2)
    expect(document.querySelector('.analytics-focus-point.is-earlier-generation')).toBeTruthy()
    expect(document.querySelectorAll('.analytics-main-plot .analytics-series-line')).toHaveLength(2)
    // Both rulers share one visual style but are never joined into one line.
    expect(document.querySelector('.analytics-generation-break')).toBeNull()
    const [earlier, current] = document.querySelectorAll('.analytics-main-plot .analytics-series-line')
    expect(earlier.classList.contains('is-earlier-generation')).toBe(true)
    expect(current.classList.contains('is-current-generation')).toBe(true)
  })

  it('renders exact focus-time evidence with neutral points, median references, and a qualified robust trend', () => {
    const rows = Array.from({ length: 8 }, (_, index) => {
      const actualSeconds = (index + 1) * 10 * 60
      const average = 40 + index * 5
      return session(index, {
        actualSeconds,
        measuredSeconds: actualSeconds,
        focusedSeconds: Math.round(actualSeconds * 0.7),
        scoreSum: average * actualSeconds,
        avgFocusScore: average,
      })
    })
    renderExplorer(rows)

    expect(screen.getByRole('heading', { name: 'Focus time vs attention' })).toBeTruthy()
    expect(screen.getByText('+15 points / 30 min')).toBeTruthy()
    expect(document.querySelector('.analytics-duration-reference')).toBeTruthy()
    expect(document.querySelector('.analytics-duration-trend')).toBeTruthy()
    expect(document.querySelectorAll('.analytics-duration-point')).toHaveLength(8)
    expect(document.querySelector('.analytics-duration-point.is-reached')).toBeNull()
  })

  it('keeps identical duration and attention values at their exact coordinate and shows their count', () => {
    renderExplorer([
      session(1, { avgFocusScore: 70 }),
      session(2, { avgFocusScore: 70 }),
      session(3, { avgFocusScore: 60, actualSeconds: 45 * 60, measuredSeconds: 45 * 60, focusedSeconds: 30 * 60, scoreSum: 60 * 45 * 60 }),
    ])

    const plot = screen.getByLabelText('Focus time and average attention across 3 sessions')
    expect(plot.querySelectorAll('.analytics-duration-point')).toHaveLength(2)
    expect(within(plot).getByText('×2')).toBeTruthy()
  })

  it('uses clean duration ticks when one long session expands the axis', () => {
    renderExplorer([
      session(1, { actualSeconds: 30 * 60, measuredSeconds: 30 * 60 }),
      session(2, { actualSeconds: 60 * 60, measuredSeconds: 60 * 60 }),
      session(3, { actualSeconds: 195 * 60, measuredSeconds: 195 * 60 }),
    ])

    const plot = screen.getByLabelText('Focus time and average attention across 3 sessions')
    expect(within(plot).getByText('180m')).toBeTruthy()
    expect(within(plot).queryByText('195m')).toBeNull()
    expect(within(plot).queryByText('210m')).toBeNull()
  })

  it('keeps a robust duration trend inside the plotted attention axis', () => {
    const attention = [96, 91, 89, 85, 82, 77, 74, 70]
    renderExplorer(attention.map((average, index) => {
      const actualSeconds = (index + 1) * 15 * 60
      return session(index, {
        actualSeconds,
        measuredSeconds: actualSeconds,
        focusedSeconds: 0,
        scoreSum: average * actualSeconds,
        avgFocusScore: average,
      })
    }))

    const trend = document.querySelector('.analytics-duration-trend')
    // The plot area spans y=30 (100) to y=214 (axis minimum) in pixels.
    expect(Number(trend.getAttribute('y1'))).toBeGreaterThanOrEqual(30)
    expect(Number(trend.getAttribute('y1'))).toBeLessThanOrEqual(214)
    expect(Number(trend.getAttribute('y2'))).toBeGreaterThanOrEqual(30)
    expect(Number(trend.getAttribute('y2'))).toBeLessThanOrEqual(214)
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

  it('keeps time of day visible while immature comparisons are still collecting', () => {
    renderExplorer([session(1), session(2)])
    expect(screen.getByRole('heading', { name: 'Where and when focus is strongest' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Time of day' })).toBeTruthy()
    expect(screen.getByText('Collecting qualified sessions: 2/8. A time period shows attention after 3 sessions.')).toBeTruthy()
    expect(screen.getByText('06–09')).toBeTruthy()
    expect(screen.getByText('22–06')).toBeTruthy()
    expect(document.querySelectorAll('.analytics-condition-signal')).toHaveLength(0)
  })

  it('explains why mature history still lacks a second comparison bucket', () => {
    renderExplorer(Array.from({ length: 8 }, (_, index) => session(index, {
      timestamp: new Date(2026, 8, 1 + index, 10).getTime(),
      workspace: { id: 'office', name: 'Office', revision: 1 },
    })))

    expect(screen.getByRole('heading', { name: 'Where and when focus is strongest' })).toBeTruthy()
    expect(screen.getByText('A comparison needs two time periods with at least 3 qualified sessions each.')).toBeTruthy()
  })

  it('shows no partial Deep Focus total when exact Flow tracking is missing from the selection', () => {
    renderExplorer([
      session(1, { flowSeconds: 420 }),
      session(2, { deepFocusTimeVersion: undefined, flowSeconds: undefined, deepFocusSeconds: 1200 }),
    ])

    expect(screen.getByLabelText('Exact Deep Focus time').textContent).toContain('Unavailable')
    expect(screen.getByText('Deep Focus is missing from 1 session in this selection, so no partial total is shown.')).toBeTruthy()
    expect(screen.queryByText('7m')).toBeNull()
  })

  it('reveals a glass tooltip for the focused session point without changing its action', () => {
    const { onSelectSession } = renderExplorer([session(1, { avgFocusScore: 77 }), session(2)])
    const point = screen.getAllByRole('button', { name: /Open session details/ })[0]
    fireEvent.focus(point)
    const tooltips = screen.getAllByRole('tooltip')
    expect(tooltips[0].classList.contains('is-visible')).toBe(true)
    expect(tooltips[0].textContent).toContain('77/100')
    fireEvent.keyDown(point, { key: 'Enter' })
    expect(onSelectSession).toHaveBeenCalledWith('s-1')
    fireEvent.blur(point)
    expect(screen.getAllByRole('tooltip')[0].classList.contains('is-visible')).toBe(false)
  })
})
