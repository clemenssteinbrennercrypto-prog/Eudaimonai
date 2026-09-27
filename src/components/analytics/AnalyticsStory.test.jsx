/* @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render as renderDom, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import AnalyticsStory from './AnalyticsStory'
import { emptyFocusLedger } from '../../lib/focusMetric'

function session(index, extra = {}) {
  const actualSeconds = 1800
  return {
    id: `s-${index}`,
    timestamp: 1_800_000_000_000 + index * 1000,
    actualSeconds,
    measuredSeconds: actualSeconds,
    focusedSeconds: 1200,
    scoreSum: 70 * actualSeconds,
    avgFocusScore: 70,
    scoreMeasured: true,
    deepFocusTimeVersion: 1,
    flowSeconds: 300,
    attentionScoringVersion: 2,
    task: `Task ${index}`,
    goalOutcome: 'yes',
    ...extra,
  }
}

afterEach(cleanup)

function renderStoryString(sessions) {
  return renderToString(React.createElement(AnalyticsStory, {
    sessions,
    focusLedger: emptyFocusLedger(),
    selectedSessionId: null,
    onSelectSession() {},
    onDeleteSession() {},
    onClearAll() {},
    onUpdateSession() {},
  })).replaceAll('<!-- -->', '')
}

function renderStory(sessions) {
  renderDom(<AnalyticsStory
    sessions={sessions}
    focusLedger={emptyFocusLedger()}
    selectedSessionId={null}
    onSelectSession={() => {}}
    onDeleteSession={() => {}}
    onClearAll={() => {}}
    onUpdateSession={() => {}}
  />)
}

describe('Analytics Story', () => {
  it('shows a clean 30-day snapshot by default', () => {
    const now = Date.now()
    const html = renderStoryString([
      session(1, { timestamp: now - 86400000, goalOutcome: 'yes', avgFocusScore: 60, scoreSum: 60 * 1800 }),
      session(2, { timestamp: now - 2 * 86400000, goalOutcome: null, avgFocusScore: 80, scoreSum: 80 * 1800 }),
    ])
    expect(html).toContain('Focus at a glance')
    expect(html).toContain('1h')
    expect(html).toContain('70/100')
    expect(html).toContain('2</strong><span>Sessions')
    expect(html).toContain('aria-pressed="true">30 days')
  })

  it('asks for missing outcomes without inventing a next-session test', () => {
    const html = renderStoryString([session(1, { goalOutcome: null })])
    expect(html).toContain('How did these sessions go?')
    expect(html).not.toContain('Next session')
    expect(html).not.toContain('Next-session test')
  })

  it('offers all-time, 30-day, and weekly ranges without cohort comparisons', () => {
    const html = renderStoryString(Array.from({ length: 16 }, (_, index) => session(index)))
    expect(html).toContain('All time')
    expect(html).toContain('30 days')
    expect(html).toContain('7 days')
    expect(html).not.toContain('previous 8')
    expect(html).not.toContain('latest 8')
  })

  it('updates all three overview metrics when the range changes', () => {
    const now = Date.now()
    renderStory([
      session(1, { timestamp: now - 2 * 86400000 }),
      session(2, { timestamp: now - 15 * 86400000 }),
      session(3, { timestamp: now - 45 * 86400000 }),
    ])
    const sessionValue = () => document.querySelector('.analytics-overview-metric:last-child strong')?.textContent

    expect(sessionValue()).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    expect(sessionValue()).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'All time' }))
    expect(sessionValue()).toBe('3')
  })

  it('keeps raw intervention counters out of the overview', () => {
    const html = renderStoryString([session(1)])
    expect(html).not.toContain('Protection blocks')
    expect(html).not.toContain('What the app did')
  })
})
