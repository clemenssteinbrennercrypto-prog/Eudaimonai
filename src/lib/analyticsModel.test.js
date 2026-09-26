import { describe, expect, it } from 'vitest'
import {
  buildAnalyticsStory,
  buildCohortProgress,
  buildDetailsSummary,
  buildFocusDistribution,
  buildInterventionSummary,
  filterDetailsSessions,
  knownComparableSessions,
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
  it('uses the newest explicit supported ruler and refuses missing versions', () => {
    const rows = [
      session(1, { attentionScoringVersion: 1 }),
      session(2, { attentionScoringVersion: undefined }),
      session(3, { attentionScoringVersion: 2 }),
    ]
    expect(knownComparableSessions(rows).map(item => item.id)).toEqual(['s-3'])
  })
})

describe('Analytics model — rolling cohort progress', () => {
  it('compares exactly the latest eight compatible sessions with the previous eight', () => {
    const rows = Array.from({ length: 16 }, (_, index) => session(index, {
      avgFocusScore: index >= 8 ? 80 : 60,
      flowSeconds: index >= 8 ? 600 : 300,
      goalOutcome: index >= 8 ? 'yes' : 'no',
    }))
    const result = buildCohortProgress(rows)
    expect(result.comparisonReady).toBe(true)
    expect(result.current.averageFocus).toBe(80)
    expect(result.previous.averageFocus).toBe(60)
    expect(result.focusDelta).toBe(20)
    expect(result.current.deepFocusSeconds).toBe(4800)
    expect(result.previous.deepFocusSeconds).toBe(2400)
    expect(result.deepFocusDeltaSeconds).toBe(2400)
    expect(result.outcomeDelta).toBe(100)
  })

  it('stays silent instead of comparing a partial previous cohort', () => {
    const result = buildCohortProgress(Array.from({ length: 12 }, (_, index) => session(index)))
    expect(result.comparisonReady).toBe(false)
    expect(result.focusDelta).toBeNull()
    expect(result.deepFocusDeltaSeconds).toBeNull()
    expect(result.outcomeDelta).toBeNull()
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
    expect(result.phases.rows).toEqual([
      { id: 'lock_in', seconds: 600, sharePct: 83 },
      { id: 'drift', seconds: 120, sharePct: 17 },
    ])
    expect(result).not.toHaveProperty('activity')
    expect(result).not.toHaveProperty('interventions')
    expect(result).not.toHaveProperty('scoreComponents')
  })
})
