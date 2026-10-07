import { describe, expect, it } from 'vitest'
import {
  buildAnalyticsStory,
  buildDetailsHeadline,
  buildDetailsSummary,
  buildFocusDistribution,
  buildInterventionSummary,
  buildOverviewSnapshot,
  filterDetailsSessions,
  knownComparableSessions,
  knownMeasurementSessions,
} from './analyticsModel'

function session(index, extra = {}) {
  const actualSeconds = 30 * 60
  const average = extra.avgFocusScore ?? 70
  return {
    id: `s-${index}`,
    timestamp: 1_800_000_000_000 + index * 1000,
    actualSeconds,
    measuredSeconds: actualSeconds,
    focusedSeconds: Math.round(actualSeconds * 0.7),
    scoreSum: average * actualSeconds,
    avgFocusScore: average,
    scoreMeasured: true,
    deepFocusTimeVersion: 2,
    flowSeconds: 300,
    attentionScoringVersion: 2,
    goalOutcome: 'yes',
    plannedDuration: 30,
    ...extra,
  }
}

describe('Analytics model — version boundaries', () => {
  it('keeps the overview average on the earlier method while the current one has too few sessions', () => {
    const earlier = Array.from({ length: 8 }, (_, i) => session(i + 1, { avgFocusScore: 60 }))
    const current = [session(20, { attentionScoringVersion: 5, avgFocusScore: 95 })]
    const snapshot = buildOverviewSnapshot([...earlier, ...current], 'all')
    expect(snapshot).toMatchObject({ averageAttention: 60, averageAttentionOnCurrentMethod: false, sessionCount: 9 })
  })

  it('uses the newest explicit supported ruler and refuses missing versions', () => {
    const rows = [
      session(1, { attentionScoringVersion: 1 }),
      session(2, { attentionScoringVersion: undefined }),
      session(3, { attentionScoringVersion: 2 }),
    ]
    expect(knownComparableSessions(rows).map(item => item.id)).toEqual(['s-3'])
  })

  it('keeps every explicit supported ruler available for a separated Details timeline', () => {
    const rows = [
      session(1, { attentionScoringVersion: 1 }),
      session(2, { attentionScoringVersion: undefined }),
      session(3, { attentionScoringVersion: 2 }),
    ]
    expect(knownMeasurementSessions(rows).map(item => item.id)).toEqual(['s-3', 's-1'])
  })
})

describe('Analytics model — overview snapshot', () => {
  const now = new Date(2026, 8, 27, 12).getTime()
  const rows = [
    session(1, { timestamp: now - 2 * 86400000, actualSeconds: 1800, measuredSeconds: 1800, scoreSum: 80 * 1800, avgFocusScore: 80 }),
    session(2, { timestamp: now - 15 * 86400000, actualSeconds: 3600, measuredSeconds: 3600, scoreSum: 60 * 3600, avgFocusScore: 60 }),
    session(3, { timestamp: now - 45 * 86400000, actualSeconds: 7200, measuredSeconds: 7200, scoreSum: 40 * 7200, avgFocusScore: 40 }),
  ]

  it('summarizes rolling weekly and 30-day windows', () => {
    expect(buildOverviewSnapshot(rows, 'week', now)).toMatchObject({
      range: 'week',
      focusSeconds: 1800,
      averageAttention: 80,
      sessionCount: 1,
    })
    expect(buildOverviewSnapshot(rows, 'month', now)).toMatchObject({
      range: 'month',
      focusSeconds: 5400,
      averageAttention: 67,
      sessionCount: 2,
    })
  })

  it('uses every session for all-time focus time and count', () => {
    expect(buildOverviewSnapshot(rows, 'all', now)).toMatchObject({
      range: 'all',
      focusSeconds: 12600,
      averageAttention: 51,
      sessionCount: 3,
    })
  })

  it('does not mix attention generations inside a range', () => {
    const result = buildOverviewSnapshot([
      session(1, { timestamp: now - 3 * 86400000, attentionScoringVersion: 1, avgFocusScore: 95, scoreSum: 95 * 1800 }),
      session(2, { timestamp: now - 2 * 86400000, attentionScoringVersion: 2, avgFocusScore: 55, scoreSum: 55 * 1800 }),
    ], 'month', now)
    expect(result).toMatchObject({ focusSeconds: 3600, averageAttention: 55, sessionCount: 2 })
  })
})

describe('Analytics model — data', () => {
  it('summarizes only interventions that were actually stored', () => {
    const result = buildInterventionSummary([session(1, {
      distractionEvents: 2,
      phaseInterventions: { gentleReminders: 3, preDriftNudges: 1 },
    })])
    expect(result).toMatchObject({ alerts: 2, gentleReminders: 3, preDriftNudges: 1, protectionEvents: null })
  })

  it('counts only successful protection events once the new field is present', () => {
    const result = buildInterventionSummary([
      session(1, { protectionEvents: [{ kind: 'app_hidden' }, { kind: 'domain_redirected' }] }),
      session(2, { protectionEvents: [] }),
    ])
    expect(result.protectionEvents).toBe(2)
    expect(result.protectionTrackedSessions).toBe(2)
  })

  it('builds a complete focus distribution without inventing missing measurements', () => {
    const result = buildFocusDistribution([
      session(1, { avgFocusScore: 10 }),
      session(2, { avgFocusScore: 50 }),
      session(3, { avgFocusScore: 90 }),
      session(4, { scoreMeasured: false }),
    ])
    expect(result.count).toBe(3)
    expect(result.median).toBe(50)
    expect(result.values).toEqual([10, 50, 90])
  })

  it('keeps unrated sessions visible as an inbox', () => {
    const story = buildAnalyticsStory([session(1, { goalOutcome: null }), session(2)])
    expect(story.unratedSessions.map(item => item.id)).toEqual(['s-1'])
  })

})

describe('Analytics model — redesigned Details', () => {
  it('applies range, outcome, and workspace to one comparable dataset', () => {
    const now = new Date(2026, 8, 26, 12).getTime()
    const rows = [
      session(1, { timestamp: now - 5 * 86400000, goalOutcome: 'yes', workspace: { id: 'desk', name: 'Desk' } }),
      session(2, { timestamp: now - 10 * 86400000, goalOutcome: 'no', workspace: { id: 'desk', name: 'Desk' } }),
      session(3, { timestamp: now - 60 * 86400000, goalOutcome: 'yes', workspace: { id: 'desk', name: 'Desk' } }),
      session(4, { timestamp: now - 2 * 86400000, goalOutcome: 'yes', workspace: { id: 'office', name: 'Office' } }),
      session(5, { timestamp: now - 100 * 86400000, attentionScoringVersion: 1, goalOutcome: 'yes', workspace: { id: 'desk', name: 'Desk' } }),
    ]

    expect(filterDetailsSessions(rows, { range: '30', outcome: 'yes', workspace: 'desk', now }).map(row => row.id))
      .toEqual(['s-1'])
    expect(filterDetailsSessions(rows, { range: 'all', outcome: 'yes', workspace: 'desk', now }).map(row => row.id))
      .toEqual(['s-1', 's-3', 's-5'])
  })

  it('keeps missing measurements as gaps and out of the distribution', () => {
    const result = buildDetailsSummary([
      session(1, { avgFocusScore: 82, goalOutcome: 'yes' }),
      session(2, { scoreMeasured: false, goalOutcome: 'no' }),
      session(3, { avgFocusScore: 64, goalOutcome: null }),
    ])

    expect(result.timeline.map(row => row.averageAttention)).toEqual([82, null, 64])
    expect(result.distribution.sessions.map(row => row.id)).toEqual(['s-1', 's-3'])
    expect(result).toMatchObject({
      sessionCount: 3,
      measuredCount: 2,
      outcomes: { yes: 1, partly: 0, no: 1, unrated: 1 },
    })
  })

  it('keeps unreliable sessions visible but excludes them from cross-session statistics', () => {
    const result = buildDetailsSummary([
      session(1, { avgFocusScore: 82 }),
      session(2, { avgFocusScore: 91, trackingFaulted: true }),
      session(3, { avgFocusScore: 20, actualSeconds: 60, measuredSeconds: 60, focusedSeconds: 40 }),
    ])

    expect(result.timeline).toHaveLength(3)
    expect(result.timeline.find(row => row.id === 's-2')).toMatchObject({ qualified: false, trackingFaulted: true })
    expect(result.distribution.sessions.map(row => row.id)).toEqual(['s-1'])
    expect(result.distribution.values).toEqual([82])
    expect(result.duration.map(row => row.id)).toEqual(['s-1'])
  })

  it('keeps earlier generations visible without admitting them into the current ruler statistics', () => {
    const result = buildDetailsSummary([
      session(1, { timestamp: new Date(2026, 6, 20).getTime(), attentionScoringVersion: 1, avgFocusScore: 95 }),
      session(2, { timestamp: new Date(2026, 7, 20).getTime(), attentionScoringVersion: 2, avgFocusScore: 55 }),
    ])

    expect(result.timeline.map(row => row.id)).toEqual(['s-1', 's-2'])
    expect(result.timeline.find(row => row.id === 's-1')).toMatchObject({ currentGeneration: false, scoreEligible: true })
    expect(result.distribution.values).toEqual([55])
    expect(result.sessionCount).toBe(2)
    expect(result.scoreableCount).toBe(1)
  })

  // 7 Oct 2026: after a scoring change the user's first session on the new
  // generation emptied every Details chart, although the history was stored.
  it('draws the charts on the earlier method until the current one has enough sessions, never both', () => {
    const earlier = Array.from({ length: 8 }, (_, i) => session(i + 1, { avgFocusScore: 60 + i }))
    const current = [session(20, { attentionScoringVersion: 5, avgFocusScore: 95 })]
    const result = buildDetailsSummary([...earlier, ...current])

    expect(result).toMatchObject({
      generation: 5,
      chartGeneration: 2,
      chartsOnCurrentMethod: false,
      currentMethodQualified: 1,
    })
    expect(result.conditions.usableCount).toBe(8)
    expect(result.phases.deepFocus).toMatchObject({ complete: true, seconds: 8 * 300 })
    expect(result.distribution.values).not.toContain(95)
    expect(result.duration.map(row => row.id)).not.toContain('s-20')
    // The trend keeps both generations, each as its own series.
    expect(result.timeline.find(row => row.id === 's-20')).toMatchObject({ currentGeneration: true, qualified: false })

    const headline = buildDetailsHeadline([...earlier, ...current], 1_800_000_000_000 + 30_000)
    expect(headline).toMatchObject({ sessionCount: 8, onCurrentMethod: false })
  })

  it('moves the charts to the current method once it has enough sessions of its own', () => {
    const earlier = Array.from({ length: 8 }, (_, i) => session(i + 1, { avgFocusScore: 60 }))
    const current = Array.from({ length: 8 }, (_, i) => session(20 + i, { attentionScoringVersion: 5, avgFocusScore: 90 }))
    const result = buildDetailsSummary([...earlier, ...current])
    expect(result).toMatchObject({ chartGeneration: 5, chartsOnCurrentMethod: true })
    expect(new Set(result.distribution.values)).toEqual(new Set([90]))
  })

  it('compares a workspace as one place, whatever revision of its layout a session used', () => {
    const desk = revision => ({ id: 'desk', name: 'Schreibtisch', revision })
    const result = buildDetailsSummary(Array.from({ length: 8 }, (_, i) => session(i + 1, { workspace: desk(1 + (i % 3)) })))
    const rows = result.conditions.workspace.rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: 'desk', label: 'Schreibtisch', sessions: 8 })
  })

  it('requires ten measured minutes before a session can influence Details statistics', () => {
    const shortSeconds = 10 * 60 - 1
    const result = buildDetailsSummary([
      session(1, { actualSeconds: shortSeconds, measuredSeconds: shortSeconds, scoreSum: 95 * shortSeconds, avgFocusScore: 95 }),
      session(2, { actualSeconds: 10 * 60, measuredSeconds: 10 * 60, focusedSeconds: 7 * 60, scoreSum: 55 * 10 * 60, avgFocusScore: 55 }),
    ])

    expect(result.timeline.find(row => row.id === 's-1')).toMatchObject({ scoreEligible: false, exclusion: 'short_session' })
    expect(result.timeline.find(row => row.id === 's-2')).toMatchObject({ scoreEligible: true, exclusion: null })
    expect(result.distribution.values).toEqual([55])
    expect(result.duration.map(row => row.id)).toEqual(['s-2'])
    expect(result.conditions.usableCount).toBe(1)
  })

  it('adds a robust duration trend only after eight qualified sessions', () => {
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

    const thin = buildDetailsSummary(rows.slice(0, 7))
    const ready = buildDetailsSummary(rows)
    expect(thin.durationAnalysis.trend).toBeNull()
    expect(ready.durationAnalysis).toMatchObject({
      count: 8,
      medianDurationMinutes: 45,
      medianAttention: 58,
      trend: { minDuration: 10, maxDuration: 80, pointsPer30Minutes: 15 },
    })
  })

  it('names strong conditions only after the refusal thresholds are met', () => {
    const morning = new Date(2026, 8, 1, 10).getTime()
    const afternoon = new Date(2026, 8, 1, 16).getTime()
    const rows = [
      ...Array.from({ length: 4 }, (_, index) => session(index, {
        timestamp: morning + index * 86400000,
        avgFocusScore: 86,
        workspace: { id: 'office', name: 'Office', revision: 1 },
      })),
      ...Array.from({ length: 4 }, (_, index) => session(index + 4, {
        timestamp: afternoon + index * 86400000,
        avgFocusScore: 52,
        workspace: { id: 'home', name: 'Home', revision: 1 },
      })),
    ]

    const result = buildDetailsSummary(rows)
    expect(result.conditions.timeOfDay.comparison).toMatchObject({
      ready: true,
      best: { id: 'morning', averageAttention: 86 },
      worst: { id: 'afternoon', averageAttention: 52 },
    })
    expect(result.conditions.workspace.comparison).toMatchObject({
      ready: true,
      best: { label: 'Office' },
      worst: { label: 'Home' },
    })

    const thin = buildDetailsSummary(rows.slice(0, 7))
    expect(thin.conditions.timeOfDay.comparison.ready).toBe(false)
    expect(thin.conditions.timeOfDay.comparison.best).toBeNull()
  })

  it('places a session by its recorded start instead of its later end time', () => {
    const startedAt = new Date(2026, 8, 1, 16).getTime()
    const endedAt = new Date(2026, 8, 1, 19).getTime()
    const rows = Array.from({ length: 8 }, (_, index) => session(index, {
      startedAt: startedAt + index * 86400000,
      timestamp: endedAt + index * 86400000,
      actualSeconds: 60 * 60,
      avgFocusScore: 72,
    }))

    const result = buildDetailsSummary(rows)
    expect(result.conditions.timeOfDay.rows.find(row => row.id === 'afternoon')).toMatchObject({
      sessions: 8,
      averageAttention: 72,
    })
    expect(result.conditions.timeOfDay.rows.find(row => row.id === 'evening').sessions).toBe(0)
  })

  it('shows qualified condition averages without naming noise as a pattern', () => {
    const morning = new Date(2026, 8, 1, 10).getTime()
    const afternoon = new Date(2026, 8, 1, 16).getTime()
    const result = buildDetailsSummary([
      ...Array.from({ length: 4 }, (_, index) => session(index, {
        timestamp: morning + index * 86400000,
        avgFocusScore: 70,
      })),
      ...Array.from({ length: 4 }, (_, index) => session(index + 4, {
        timestamp: afternoon + index * 86400000,
        avgFocusScore: 65,
      })),
    ])

    expect(result.conditions.timeOfDay.comparison).toEqual({ ready: true, best: null, worst: null })
  })

  it('summarizes only stored, finite attention-phase time', () => {
    const result = buildDetailsSummary([
      session(1, { focusPhases: { seconds: { lock_in: 600, drift: 120, recovery: Number.NaN } } }),
      session(2),
    ])

    expect(result.phases).toMatchObject({ tracedSessions: 1, totalSeconds: 720 })
    expect(result.phases.deepFocus).toEqual({
      seconds: 600,
      knownSeconds: 600,
      trackedSessions: 2,
      measuredSessions: 2,
      complete: true,
    })
    expect(result.phases.rows).toEqual([
      { id: 'lock_in', seconds: 600, sharePct: 83 },
      { id: 'drift', seconds: 120, sharePct: 17 },
    ])
    expect(result).not.toHaveProperty('activity')
    expect(result).not.toHaveProperty('interventions')
    expect(result).not.toHaveProperty('scoreComponents')
  })

  it('refuses a partial Deep Focus total when one qualified session predates exact Flow time', () => {
    const result = buildDetailsSummary([
      session(1, { flowSeconds: 420 }),
      session(2, { deepFocusTimeVersion: undefined, flowSeconds: undefined, deepFocusSeconds: 1200 }),
    ])

    expect(result.phases.deepFocus).toEqual({
      seconds: null,
      knownSeconds: 420,
      trackedSessions: 1,
      measuredSessions: 2,
      complete: false,
    })
  })
})

describe('Analytics model — Details headline', () => {
  const now = new Date(2026, 8, 26, 12).getTime()
  const day = 86400000
  const windowed = (offsetDays, count, score, extra = {}) => Array.from({ length: count }, (_, index) =>
    session(`${offsetDays}-${index}`, { timestamp: now - (offsetDays + index * 0.5) * day, avgFocusScore: score, scoreSum: score * 1800, ...extra }))

  it('averages plotted current-generation sessions and ignores short or older-ruler ones', () => {
    const headline = buildDetailsHeadline([
      ...windowed(1, 2, 80),
      session('short', { timestamp: now - day, actualSeconds: 5 * 60, measuredSeconds: 5 * 60, avgFocusScore: 10, scoreSum: 10 * 300 }),
      session('old', { timestamp: now - 3 * day, attentionScoringVersion: 1, avgFocusScore: 10, scoreSum: 10 * 1800 }),
    ], now)
    expect(headline.averageAttention).toBe(80)
    expect(headline.sessionCount).toBe(2)
    expect(headline.delta).toBeNull()
  })

  it('reports a delta only when both 30-day windows reach the evidence floor', () => {
    expect(buildDetailsHeadline([...windowed(1, 8, 80), ...windowed(31, 8, 70)], now).delta).toBe(10)
    expect(buildDetailsHeadline([...windowed(1, 8, 80), ...windowed(31, 7, 70)], now).delta).toBeNull()
  })

  it('never compares windows across measurement generations', () => {
    const headline = buildDetailsHeadline([
      ...windowed(1, 8, 80),
      ...windowed(31, 8, 40, { attentionScoringVersion: 1 }),
    ], now)
    expect(headline.previousCount).toBe(0)
    expect(headline.delta).toBeNull()
  })
})
