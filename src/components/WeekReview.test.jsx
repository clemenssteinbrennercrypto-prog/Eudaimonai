import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import WeekReview from './WeekReview'

const html = review => renderToString(<WeekReview review={review} title="Nov 9–15, 2026" />).replaceAll('<!-- -->', '')
const facts = overrides => ({ sessionCount: 3, qualifyingCount: 3, deepFocusSeconds: 5400, averageAttention: 70, lapsesPerHour: 2.5, bestDay: { dayKey: '2026-11-12', score: 58 }, ...overrides })

describe('WeekReview', () => {
  it('compares a finished week, marking only improvements', () => {
    const out = html({ isCurrent: false, current: facts(), previous: facts({ deepFocusSeconds: 3600, averageAttention: 72, lapsesPerHour: 3.1 }), recordsThisWeek: [] })
    expect(out).toContain('<b class="is-up">+30m vs last week</b>')
    // Fewer lapses is better; less attention is reported without alarm.
    expect(out).toContain('<b class="is-up">−0.6 vs last week</b>')
    expect(out).toContain('<b class="">−2 vs last week</b>')
    expect(out).toContain('Thursday')
  })

  it('shows last week beside cumulative values while the week is running', () => {
    const out = html({ isCurrent: true, current: facts(), previous: facts({ deepFocusSeconds: 3600 }), recordsThisWeek: [] })
    expect(out).toContain('Last week 1h')
    expect(out).not.toContain('+30m')
  })

  it('names records set during the week', () => {
    const out = html({ isCurrent: false, current: facts(), previous: null, recordsThisWeek: [{ key: 'longestBlock' }] })
    expect(out).toContain('Records set this week: Longest Deep Focus block')
  })

  it('says so plainly when the week has no sessions', () => {
    expect(html({ isCurrent: true, current: facts({ sessionCount: 0 }), previous: null, recordsThisWeek: [] })).toContain('No sessions this week yet.')
  })
})
