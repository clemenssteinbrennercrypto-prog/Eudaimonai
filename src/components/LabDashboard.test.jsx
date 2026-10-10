/** @vitest-environment jsdom */
import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import LabDashboard from './LabDashboard'
import { FOCUS_METRIC_V1 } from '../lib/focusMetric'
import { NATIVE_CAMERA_MEASUREMENT_V2 } from '../lib/cameraMeasurement'
import { loadFocusLedger, saveSession } from '../lib/storage'
import FocusScorePanel from './analytics/FocusScorePanel'
import FocusScoreExplanation from './FocusScoreExplanation'

class MemoryStorage {
  constructor() { this.values = new Map() }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  })
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 26, 14, 0, 0))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('LabDashboard metric labels', () => {
  it('explains a refused multi-day score even when today itself is measurable', () => {
    render(React.createElement(FocusScoreExplanation, {
      period: {
        range: 'week', score: null, refusal: 'missing_exact_deep_focus',
        today: { status: 'measured', score: 60 }, days: [], partialMetricPeriod: false,
      },
    }))
    expect(screen.getByText(/Some sessions after this score began are missing exact Deep Focus time/)).toBeInTheDocument()
    expect(screen.queryByText('Today’s score: 60.')).not.toBeInTheDocument()
  })

  it('explains the forward-only boundary without hiding historical Focus Time', () => {
    render(React.createElement(FocusScoreExplanation, {
      period: {
        range: 'week', score: null, refusal: null, beforeMetricPeriod: true,
        today: null, days: [], partialMetricPeriod: false, referenceWorkdays: 1,
      },
    }))
    expect(screen.getByText(/Historical session time remains visible/)).toBeInTheDocument()
  })

  it('describes a weekend-only score against one fixed reference weekday', () => {
    render(React.createElement(FocusScoreExplanation, {
      period: {
        range: 'week', score: 63, refusal: null, beforeMetricPeriod: false,
        today: null, days: [], partialMetricPeriod: false, referenceWorkdays: 1,
      },
    }))
    expect(screen.getByText('This period is scored against one weekday so far. Weekend work still counts.')).toBeInTheDocument()
  })

  it('keeps score scope visible when older Focus Time has no stored camera coverage', () => {
    render(React.createElement(FocusScoreExplanation, {
      period: {
        range: 'week', score: 63, measuredSeconds: 3600,
        today: null, days: [], partialMetricPeriod: false, referenceWorkdays: 1,
      },
      time: {
        focusSeconds: 7200,
        measuredSeconds: null,
        measurementCoverageUnknown: true,
      },
    }))

    expect(screen.getByText(/Focus Score uses 1h of 2h session time/)).toBeInTheDocument()
    expect(screen.getByText(/Camera coverage is unavailable for part of this session time/)).toBeInTheDocument()
  })

  it('says that V4 is waiting when no exact Deep Focus session exists yet', () => {
    render(React.createElement(FocusScoreExplanation, {
      period: {
        range: 'day', score: null, refusal: null, beforeMetricPeriod: false,
        today: { status: 'awaiting_metric' }, days: [], partialMetricPeriod: false,
        referenceWorkdays: 1,
      },
    }))
    expect(screen.getByText(/exact Deep Focus time required to start the current Focus Score/)).toBeInTheDocument()
  })

  it('separates active Focus Time from forward-only exact Deep Focus', () => {
    vi.setSystemTime(new Date(2026, 8, 16, 10))
    const historicalStart = new Date(2026, 8, 14, 9).getTime()
    const historical = saveSession({
      startedAt: historicalStart, timestamp: historicalStart + 3620_000,
      actualSeconds: 3620, measuredSeconds: 3600, scoreSum: 288000, focusedSeconds: 3450, avgFocusScore: 80,
      attentionScoringVersion: 2, focusMetricVersion: 1, focusMetricRejection: null,
      sessionEfficiency: 80, deepFocusSeconds: 3600,
    })
    const currentStart = new Date(2026, 8, 16, 9).getTime()
    const current = saveSession({
      startedAt: currentStart, timestamp: currentStart + 3620_000,
      actualSeconds: 3620, measuredSeconds: 3600, scoreSum: 288000, focusedSeconds: 3450, avgFocusScore: 80,
      attentionScoringVersion: 2, focusMetricVersion: 1, focusMetricRejection: null,
      sessionEfficiency: 80, deepFocusSeconds: 3600,
      deepFocusTimeVersion: 2, flowSeconds: 120,
    })
    const originalLedger = loadFocusLedger()
    render(React.createElement(LabDashboard, { sessions: [current, historical], ledger: originalLedger }))
    expect(screen.getByRole('heading', { name: 'Focus Score' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Time + attention + consistency' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^(Weekly|week)$/ }))
    // The score starts with exact Deep Focus, while the independent clock keeps
    // both sessions instead of making earlier work disappear.
    expect(screen.getByText('41')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Focus Score' })).toBeInTheDocument()
    expect(screen.getByText('of 100')).toBeInTheDocument()
    const focusTime = screen.getByText('Session time').parentElement
    expect(focusTime).toHaveTextContent('2h')
    fireEvent.click(within(focusTime).getByRole('button', { name: 'What Session time means' }))
    expect(screen.getByRole('dialog', { name: 'What Session time means' })).toHaveTextContent('Time in sessions, without breaks')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(focusTime).not.toHaveTextContent('2m')
    // The Weekly view adds a week review below; these are the hero's metrics.
    const hero = within(document.querySelector('.lab-hero'))
    expect(hero.getByText('Deep Focus').parentElement).toHaveTextContent('Missing for some sessions')
    // The Lab shows warnings only; the routine "uses X of Y" note lives in
    // Analytics. Both numbers stay visible as separate metrics above.
    expect(screen.queryByText(/Focus Score uses 1h of 2h 40s session time/)).not.toBeInTheDocument()
    expect(screen.queryByText('Measured days')).not.toBeInTheDocument()
    expect(hero.getByText('Average attention').parentElement).toHaveTextContent('80/100')
    expect(screen.queryByText('Time credit')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\b(?:V1|V2|ruler|phase-weighted)\b|time \+ attention/i)
    expect(loadFocusLedger()).toEqual(originalLedger)
  })

  it('shows historical active time without relabelling it as Deep Focus', () => {
    vi.setSystemTime(new Date(2026, 7, 25, 12))
    const startedAt = new Date(2026, 7, 25, 9).getTime()
    const saved = saveSession({
      startedAt, timestamp: startedAt + 7220_000,
      actualSeconds: 7220, measuredSeconds: 7200, scoreSum: 540000, focusedSeconds: 6000,
      avgFocusScore: 75, attentionScoringVersion: 2, focusMetricVersion: 1,
      focusMetricRejection: null, sessionEfficiency: 75, deepFocusSeconds: 7200,
    })

    render(React.createElement(LabDashboard, { sessions: [saved], ledger: loadFocusLedger() }))

    const metric = screen.getByText('Session time').parentElement
    expect(metric).toHaveTextContent('2h')
    expect(within(metric).getByRole('button', { name: 'What Session time means' })).toBeInTheDocument()
    expect(metric).not.toHaveTextContent('—')
    expect(screen.getByText('Deep Focus').parentElement).toHaveTextContent('Missing for some sessions')
  })

  it('presents one Focus Score in the historical analytics panel', () => {
    vi.setSystemTime(new Date(2026, 7, 25, 12))
    const startedAt = new Date(2026, 7, 25, 9).getTime()
    const saved = saveSession({
      startedAt, timestamp: startedAt + 7220_000,
      actualSeconds: 7220, measuredSeconds: 7200, scoreSum: 540000,
      attentionScoringVersion: 2, focusMetricVersion: 1, focusMetricRejection: null,
      sessionEfficiency: 75, deepFocusSeconds: 7200,
      deepFocusTimeVersion: 2, flowSeconds: 3600,
    })
    render(React.createElement(FocusScorePanel, { sessions: [saved], ledger: loadFocusLedger() }))
    expect(screen.getAllByText('Focus Score').length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: 'week' }))
    // 135 effective minutes; tracking starts Tuesday, so one elapsed weekday.
    expect(screen.getByText('66')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Focus Score formula' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\b(?:V1|V2|ruler|phase-weighted)\b|time \+ attention/i)
  })

  it('keeps the unified weekly explanation in the historical analytics panel', () => {
    const startedAt = new Date(2026, 7, 25, 9).getTime()
    const saved = saveSession({
      startedAt, timestamp: startedAt + 7220_000,
      actualSeconds: 7220, measuredSeconds: 7200, scoreSum: 540000,
      attentionScoringVersion: 2, focusMetricVersion: 1, focusMetricRejection: null,
      sessionEfficiency: 75, deepFocusSeconds: 7200,
      deepFocusTimeVersion: 2, flowSeconds: 3600,
    })
    render(React.createElement(FocusScorePanel, { sessions: [saved], ledger: loadFocusLedger() }))
    expect(screen.getByText('No session today.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^(Weekly|week)$/ }))
    // 120 measured + 25% of 60 Deep Focus minutes against two weekdays.
    expect(screen.getByText('45')).toBeInTheDocument()
    expect(screen.getAllByText('Focus Score').length).toBeGreaterThan(1)
    expect(screen.getByText('No session today.')).toBeInTheDocument()
    expect(screen.getByText('This period is scored against 2 weekdays so far. Weekend work still counts.')).toBeInTheDocument()
  })

  it('refreshes the historical Focus Score day after midnight without changed props', () => {
    vi.setSystemTime(new Date(2026, 7, 26, 23, 59, 50))
    const startedAt = new Date(2026, 7, 26, 9).getTime()
    const saved = saveSession({
      startedAt, timestamp: startedAt + 7220_000,
      actualSeconds: 7220, measuredSeconds: 7200, scoreSum: 540000,
      attentionScoringVersion: 2, focusMetricVersion: 1, focusMetricRejection: null,
      sessionEfficiency: 75, deepFocusSeconds: 7200,
      deepFocusTimeVersion: 2, flowSeconds: 3600,
    })
    render(React.createElement(FocusScorePanel, { sessions: [saved], ledger: loadFocusLedger() }))
    expect(screen.getByText('66')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(30_000))
    expect(screen.queryByText('66')).not.toBeInTheDocument()
    expect(screen.getByText('No session today.')).toBeInTheDocument()
  })

  it('keeps the analytics historical day fixed across the midnight refresh', () => {
    vi.setSystemTime(new Date(2026, 7, 26, 23, 59, 50))
    render(React.createElement(FocusScorePanel, { sessions: [], ledger: loadFocusLedger() }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(screen.getByText('Tuesday, Aug 25, 2026')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(30_000))
    expect(screen.getByText('Tuesday, Aug 25, 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }))
    expect(screen.getByText('Wednesday, Aug 26, 2026')).toBeInTheDocument()
    expect(screen.getByText('No session this day.')).toBeInTheDocument()
  })

  it('navigates one shared day, week, or month across both dashboard signals', () => {
    render(React.createElement(LabDashboard, {
      focusModeEnabled: false,
      sessions: [],
      ledger: loadFocusLedger(),
      onSession() {},
      onProtection() {},
      onAnalytics() {},
    }))

    const rangeGroup = screen.getByRole('group', { name: 'Dashboard range' })
    expect(screen.getAllByRole('button', { name: /^(Daily|Weekly|Monthly)$/ })).toHaveLength(3)
    expect(rangeGroup.querySelector('[aria-pressed="true"]')).toHaveTextContent('Daily')
    expect(screen.getByRole('button', { name: 'Show next day' })).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Monthly' }))
    expect(screen.getByRole('img', { name: 'Attention field for August 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show next month' })).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Show previous month' }))
    expect(screen.getByRole('img', { name: 'Attention field for July 2026' })).toBeInTheDocument()
    const nextMonth = screen.getByRole('button', { name: 'Show next month' })
    expect(nextMonth).toHaveAttribute('aria-disabled', 'false')
    nextMonth.focus()
    fireEvent.click(nextMonth)
    expect(screen.getByRole('img', { name: 'Attention field for August 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show next month' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Show next month' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Show previous month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }))
    expect(screen.getByRole('img', { name: 'Attention field for Aug 24–Aug 30, 2026' })).toBeInTheDocument()
    expect(rangeGroup.querySelector('[aria-pressed="true"]')).toHaveTextContent('Weekly')
    expect(screen.getByRole('button', { name: 'Show next week' })).toHaveAttribute('aria-disabled', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Show previous week' }))
    expect(screen.getByRole('img', { name: 'Attention field for Aug 17–Aug 23, 2026' })).toBeInTheDocument()
  })

  it('keeps an open historical period fixed when the current date rolls over', () => {
    const startedAt = new Date(2026, 7, 26, 18, 0, 0).getTime()
    const saved = saveSession({
      task: 'Later that day',
      startedAt,
      timestamp: startedAt + 620_000,
      actualSeconds: 620,
      measuredSeconds: 600,
      scoreSum: 46_800,
      focusedSeconds: 480,
      attentionScoringVersion: NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion,
      attentionMeasurementSource: NATIVE_CAMERA_MEASUREMENT_V2.id,
      focusMetricVersion: FOCUS_METRIC_V1.version,
      focusMetricRejection: null,
      sessionEfficiency: 78,
      deepFocusSeconds: 600,
      deepFocusTimeVersion: 2,
      flowSeconds: 240,
      timeline: [{ second: 60, score: 82 }],
    })
    const props = {
      focusModeEnabled: false,
      sessions: [saved],
      ledger: loadFocusLedger(),
      onSession() {},
      onProtection() {},
      onAnalytics() {},
    }
    const view = render(React.createElement(LabDashboard, props))

    fireEvent.click(screen.getByRole('button', { name: 'Show previous day' }))
    expect(screen.getByRole('img', { name: 'Attention field for Tuesday, Aug 25, 2026' })).toBeInTheDocument()

    vi.setSystemTime(new Date(2026, 7, 27, 1, 0, 0))
    view.rerender(React.createElement(LabDashboard, props))
    expect(screen.getByRole('img', { name: 'Attention field for Tuesday, Aug 25, 2026' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show next day' }))
    expect(screen.getByRole('img', { name: 'Attention field for Wednesday, Aug 26, 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show next day' })).toHaveAttribute('aria-disabled', 'false')
    expect(view.container.querySelectorAll('.attention-field .is-future')).toHaveLength(0)
    expect(view.container.querySelector('.attention-field .is-strong')).toHaveAttribute('aria-label', 'Later that day · Focus 82')
    expect(view.container.querySelector('.lab-ring-center > strong')).not.toHaveTextContent('—')

    fireEvent.click(screen.getByRole('button', { name: 'Show next day' }))
    expect(screen.getByRole('img', { name: 'Attention field for Thursday, Aug 27, 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show next day' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('loads a real score and attention signal from a previous month', () => {
    const startedAt = new Date(2026, 6, 15, 9, 0, 0).getTime()
    const saved = saveSession({
      task: 'Historical measured work',
      startedAt,
      timestamp: startedAt + 620_000,
      actualSeconds: 620,
      measuredSeconds: 600,
      scoreSum: 46_800,
      focusedSeconds: 480,
      attentionScoringVersion: NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion,
      attentionMeasurementSource: NATIVE_CAMERA_MEASUREMENT_V2.id,
      focusMetricVersion: FOCUS_METRIC_V1.version,
      focusMetricRejection: null,
      sessionEfficiency: 78,
      deepFocusSeconds: 600,
      deepFocusTimeVersion: 2,
      flowSeconds: 240,
      timeline: [{ second: 60, score: 82 }],
    })
    const view = render(React.createElement(LabDashboard, {
      focusModeEnabled: false,
      sessions: [saved],
      ledger: loadFocusLedger(),
      onSession() {},
      onProtection() {},
      onAnalytics() {},
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Monthly' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show previous month' }))
    expect(screen.getByRole('img', { name: 'Attention field for July 2026' })).toBeInTheDocument()
    expect(view.container.querySelector('.lab-ring-center > strong')).not.toHaveTextContent('—')
    expect(view.container.querySelector('.attention-field .is-strong')).toHaveAttribute('aria-label', 'Historical measured work · Focus 82')
    expect(screen.getByText('Session time').parentElement).toHaveTextContent('10m')
  })

  it('labels a DST fallback day by local wall-clock quarters', () => {
    const previousTimezone = process.env.TZ
    process.env.TZ = 'Europe/Vienna'
    try {
      vi.setSystemTime(new Date(2026, 9, 25, 12, 0, 0))
      const view = render(React.createElement(LabDashboard, {
        focusModeEnabled: false,
        sessions: [],
        ledger: loadFocusLedger(),
        onSession() {},
        onProtection() {},
        onAnalytics() {},
      }))
      const labels = [...view.container.querySelectorAll('.attention-axis span')].map(tick => tick.textContent)

      expect(labels).toEqual(['00:00', '06:00', '12:00', '18:00', '24:00'])
    } finally {
      if (previousTimezone == null) delete process.env.TZ
      else process.env.TZ = previousTimezone
    }
  })

  it('keeps Focus Score, Focus Time, and Deep Focus semantically distinct', () => {
    // saveSession still runs so the focus ledger is built by the real code
    // path; sessions and ledger are then handed to the component as props,
    // which is how App supplies them at runtime.
    const saved = saveSession({
      task: 'Measured work',
      startedAt: Date.now() - 620_000,
      actualSeconds: 620,
      measuredSeconds: 600,
      scoreSum: 46_800,
      focusedSeconds: 480,
      attentionScoringVersion: NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion,
      attentionMeasurementSource: NATIVE_CAMERA_MEASUREMENT_V2.id,
      focusMetricVersion: FOCUS_METRIC_V1.version,
      focusMetricRejection: null,
      sessionEfficiency: 78,
      deepFocusSeconds: 600,
      deepFocusMinutes: 10,
      deepFocusTimeVersion: 2,
      flowSeconds: 240,
      timeline: [
        { second: 30, score: 82 },
        { second: 300, score: 55 },
        { second: 590, score: 22 },
      ],
    })

    const html = renderToString(React.createElement(LabDashboard, {
      focusModeEnabled: false,
      sessions: [saved],
      ledger: loadFocusLedger(),
      onSession() {},
      onProtection() {},
      onAnalytics() {},
    })).replaceAll('<!-- -->', '')

    expect(html).toContain('Measured work')
    expect(html).toContain('Attention 78')
    expect(html).toContain('Average attention')
    expect(html).toContain('Session time')
    expect(html).toContain('10m')
    expect(html).toContain('Deep Focus')
    expect(html).toContain('4m')
    expect(html).toContain('aria-label="What Session time means"')
    expect(html).not.toContain('Time credit')
    expect(html).not.toContain('78% efficiency')
    expect(html).toContain('aria-label="Measured work · Focus 53"')
    expect(html).not.toContain('Complete a measured session to reveal your attention field.')
    expect(html).not.toContain('Measured focus')
    expect(html).not.toContain('78 focus')
  })

  it('keeps each metric definition behind its own info button', () => {
    render(<LabDashboard focusModeEnabled={false} sessions={[]} ledger={loadFocusLedger()} />)

    const definitions = [
      ['What Session time means', 'Time in sessions, without breaks'],
      ['What Average attention means', 'Average while the camera could see you'],
      ['What Deep Focus means', 'Stretches of 90 s or more of steady attention'],
    ]
    for (const [label, text] of definitions) {
      expect(screen.queryByText(text)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(screen.getByRole('dialog', { name: label })).toHaveTextContent(text)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: label })).not.toBeInTheDocument()
    }
  })

  it('reveals the session name on hover without showing exact activity names', () => {
    const startedAt = Date.now() - 620_000
    const saved = saveSession({
      task: 'Write the chapter',
      startedAt,
      timestamp: startedAt + 620_000,
      actualSeconds: 620,
      measuredSeconds: 600,
      scoreSum: 46_800,
      focusedSeconds: 480,
      attentionScoringVersion: NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion,
      attentionMeasurementSource: NATIVE_CAMERA_MEASUREMENT_V2.id,
      focusMetricVersion: FOCUS_METRIC_V1.version,
      focusMetricRejection: null,
      sessionEfficiency: 78,
      timeline: [
        { second: 30, score: 82, activity: { kind: 'aligned', label: 'Thesis intro — Word' } },
        { second: 300, score: 55, activity: { kind: 'supportive', label: 'scholar.google.com' } },
      ],
    })

    const view = render(React.createElement(LabDashboard, {
      focusModeEnabled: false,
      sessions: [saved],
      ledger: loadFocusLedger(),
      onSession() {},
      onProtection() {},
      onAnalytics() {},
    }))

    expect(view.container).not.toHaveTextContent('Thesis intro — Word')
    expect(view.container).not.toHaveTextContent('scholar.google.com')

    const field = view.container.querySelector('.attention-field')
    const frame = view.container.querySelector('.attention-field-frame')
    const measuredBar = view.container.querySelector('.attention-bin[aria-label^="Write the chapter"]')
    const measuredIndex = [...field.querySelectorAll('.attention-bin')].indexOf(measuredBar)
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 960 })
    fireEvent.mouseMove(frame, { clientX: measuredIndex * 10 + 5 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Write the chapter13:49–14:00')
    expect(screen.getByRole('tooltip')).toHaveClass('is-visible')

    const emptyIndex = [...field.querySelectorAll('.attention-bin')].findIndex(bin => !bin.getAttribute('aria-label').startsWith('Write the chapter'))
    fireEvent.mouseMove(frame, { clientX: emptyIndex * 10 + 5 })
    expect(screen.getByRole('tooltip')).not.toHaveClass('is-visible')

    fireEvent.mouseMove(frame, { clientX: measuredIndex * 10 + 5 })
    fireEvent.mouseLeave(frame)
    expect(screen.getByRole('tooltip')).not.toHaveClass('is-visible')
  })

  it('distinguishes same-name sessions by dated time ranges in multi-day views', () => {
    const firstStart = new Date(2026, 7, 25, 9).getTime()
    const secondStart = new Date(2026, 7, 26, 11).getTime()
    const makeSaved = startedAt => saveSession({
      task: 'Repeated task',
      startedAt,
      timestamp: startedAt + 600_000,
      actualSeconds: 600,
      measuredSeconds: 600,
      scoreSum: 48_000,
      focusedSeconds: 500,
      attentionScoringVersion: NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion,
      attentionMeasurementSource: NATIVE_CAMERA_MEASUREMENT_V2.id,
      focusMetricVersion: FOCUS_METRIC_V1.version,
      focusMetricRejection: null,
      sessionEfficiency: 80,
      timeline: [{ second: 30, score: 80 }],
    })
    const sessions = [makeSaved(firstStart), makeSaved(secondStart)]
    const view = render(React.createElement(LabDashboard, {
      focusModeEnabled: false,
      sessions,
      ledger: loadFocusLedger(),
      onSession() {},
      onProtection() {},
      onAnalytics() {},
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }))
    const field = view.container.querySelector('.attention-field')
    const frame = view.container.querySelector('.attention-field-frame')
    const allBars = [...field.querySelectorAll('.attention-bin')]
    const namedBars = allBars.filter(bin => bin.getAttribute('aria-label').startsWith('Repeated task'))
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ left: 0, width: allBars.length * 10 })

    const firstIndex = allBars.indexOf(namedBars[0])
    fireEvent.mouseMove(frame, { clientX: firstIndex * 10 + 5 })
    const firstTooltip = screen.getByRole('tooltip').textContent
    expect(firstTooltip).toMatch(/Aug 25|25 Aug/)
    expect(firstTooltip).toContain('09:00–09:10')

    const secondIndex = allBars.indexOf(namedBars.at(-1))
    fireEvent.mouseMove(frame, { clientX: secondIndex * 10 + 5 })
    const secondTooltip = screen.getByRole('tooltip').textContent
    expect(secondTooltip).toMatch(/Aug 26|26 Aug/)
    expect(secondTooltip).toContain('11:00–11:10')
  })
})

describe('LabDashboard score notes', () => {
  it('keeps real measurement warnings while dropping routine score lines', () => {
    const period = {
      range: 'week', days: [], today: { status: 'measured', score: 45 }, score: 53,
      referenceWorkdays: 5, measuredSeconds: 3600, partialMetricPeriod: false,
    }
    const time = { focusSeconds: 7200, measurementWarning: true, measurementCoverage: 0.6 }
    render(React.createElement(FocusScoreExplanation, { period, time, warningsOnly: true }))
    expect(screen.getByText(/Only 60% of session time could be measured/)).toBeInTheDocument()
    expect(screen.queryByText(/Today’s score/)).not.toBeInTheDocument()
    expect(screen.queryByText(/scored against/)).not.toBeInTheDocument()
    expect(screen.queryByText('How this score works')).not.toBeInTheDocument()
  })

  it('keeps a refusal visible in the Lab', () => {
    const period = { range: 'week', days: [], today: null, score: null, refusal: 'missing_exact_deep_focus' }
    render(React.createElement(FocusScoreExplanation, { period, time: null, warningsOnly: true }))
    expect(screen.getByText(/missing exact Deep Focus time, so no period score is shown/)).toBeInTheDocument()
  })

  it('renders nothing when there is nothing to warn about', () => {
    const period = { range: 'day', days: [{ status: 'measured' }], today: { status: 'measured', score: 45 }, score: 45 }
    const view = render(React.createElement(FocusScoreExplanation, { period, time: { focusSeconds: 600 }, warningsOnly: true }))
    expect(view.container).toBeEmptyDOMElement()
  })
})

describe('LabDashboard personal baseline', () => {
  // Same pipeline as App: derive the session metric, then add it to the ledger.
  function day(id, date, { minutes = 60, attention = 70, flowMinutes = 30 } = {}) {
    const startedAt = date.getTime()
    const measuredSeconds = minutes * 60
    return {
      id,
      task: id,
      startedAt,
      timestamp: startedAt + (measuredSeconds + 120) * 1000,
      endedAt: startedAt + (measuredSeconds + 120) * 1000,
      actualSeconds: measuredSeconds + 120,
      measuredSeconds,
      scoreSum: measuredSeconds * attention,
      focusedSeconds: measuredSeconds,
      avgFocusScore: attention,
      finalScore: attention,
      attentionScoringVersion: NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion,
      deepFocusTimeVersion: 2,
      flowSeconds: flowMinutes * 60,
      focusPhases: { seconds: { lock_in: measuredSeconds } },
      timeline: [{ second: 5, score: attention }],
    }
  }

  async function renderWithDays(count) {
    vi.setSystemTime(new Date(2026, 9, 20, 16))
    const { addSessionToFocusLedger, emptyFocusLedger, withSessionFocusMetric } = await import('../lib/focusMetric')
    const sessions = [
      ...Array.from({ length: count }, (_, i) => withSessionFocusMetric(day(`past${i}`, new Date(2026, 9, 10 + i, 9), { flowMinutes: 30, attention: 70 }))),
      withSessionFocusMetric(day('today', new Date(2026, 9, 20, 9), { flowMinutes: 45, attention: 74 })),
    ]
    const ledger = sessions.reduce((current, item) => addSessionToFocusLedger(current, item), emptyFocusLedger())
    render(<LabDashboard focusModeEnabled={false} sessions={[...sessions].reverse()} ledger={ledger} />)
  }

  it('says nothing until five scored days exist', async () => {
    await renderWithDays(4)
    expect(screen.queryByText(/usual/i)).not.toBeInTheDocument()
  })

  it('compares attention today but shows cumulative values only as the usual', async () => {
    await renderWithDays(5)
    // Today is still running: Deep Focus and the score show the usual, not a gap.
    expect(screen.getByText('Usual day 30m')).toBeInTheDocument()
    expect(screen.getByText(/^Usual day \d+$/)).toBeInTheDocument()
    // Attention is not cumulative, so it is compared.
    expect(screen.getByText('+4 vs usual')).toHaveClass('is-up')
  })

  it('shows the earlier method\'s usual as a reference without a comparison after a method change', async () => {
    vi.setSystemTime(new Date(2026, 9, 20, 16))
    const { addSessionToFocusLedger, emptyFocusLedger, withSessionFocusMetric } = await import('../lib/focusMetric')
    const sessions = [
      ...Array.from({ length: 5 }, (_, i) => withSessionFocusMetric(day(`past${i}`, new Date(2026, 9, 10 + i, 9), { flowMinutes: 30, attention: 70 }))),
      withSessionFocusMetric({ ...day('today', new Date(2026, 9, 20, 9), { flowMinutes: 45, attention: 74 }), attentionScoringVersion: 5 }),
    ]
    const ledger = sessions.reduce((current, item) => addSessionToFocusLedger(current, item), emptyFocusLedger())
    render(<LabDashboard focusModeEnabled={false} sessions={[...sessions].reverse()} ledger={ledger} />)
    expect(screen.getByText('Usual day 30m · earlier method')).toBeInTheDocument()
    expect(screen.getByText('Usual day 70 · earlier method')).toBeInTheDocument()
    // No delta across methods, and no "returns after" note while a usual shows.
    expect(screen.queryByText(/vs usual/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Your usual returns/)).not.toBeInTheDocument()
  })

  it('compares every value on a finished day', async () => {
    vi.setSystemTime(new Date(2026, 9, 20, 16))
    const { addSessionToFocusLedger, emptyFocusLedger, withSessionFocusMetric } = await import('../lib/focusMetric')
    const sessions = [
      ...Array.from({ length: 5 }, (_, i) => withSessionFocusMetric(day(`past${i}`, new Date(2026, 9, 10 + i, 9), { flowMinutes: 30, attention: 70 }))),
      withSessionFocusMetric(day('yesterday', new Date(2026, 9, 19, 9), { flowMinutes: 45, attention: 66 })),
    ]
    const ledger = sessions.reduce((current, item) => addSessionToFocusLedger(current, item), emptyFocusLedger())
    render(<LabDashboard focusModeEnabled={false} sessions={[...sessions].reverse()} ledger={ledger} />)
    fireEvent.click(screen.getByLabelText('Show previous day'))
    expect(screen.getByText('+15m vs usual')).toBeInTheDocument()
    // A shortfall is stated, not alarmed: no green, no red.
    const attention = screen.getByText('−4 vs usual')
    expect(attention).not.toHaveClass('is-up')
    expect(screen.queryByText(/^Usual day/)).not.toBeInTheDocument()
  })
})
