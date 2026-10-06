import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import SessionMeasures from './SessionMeasures'

const render = session => renderToString(React.createElement(SessionMeasures, { session })).replaceAll('<!-- -->', '')

function measuredSession(samples) {
  return {
    actualSeconds: samples.length * 5 + 30,
    measuredSeconds: samples.length * 5,
    focusedSeconds: samples.filter(s => s.focused).length * 5,
    avgFocusScore: 70,
    deepFocusTimeVersion: 2,
    flowSeconds: samples.filter(s => s.deepFocused).length * 5 + 90,
    timeline: samples,
  }
}

describe('SessionMeasures', () => {
  it('shows the measures that could be computed', () => {
    const samples = Array.from({ length: 80 }, (_, i) => ({
      second: (i + 1) * 5,
      score: i >= 40 && i < 42 ? 30 : i >= 60 ? 80 : 70,
      focused: !(i >= 40 && i < 42),
      deepFocused: i >= 60,
      activity: { kind: 'aligned', label: 't', app: i < 50 ? 'Code' : 'Safari', domain: '' },
    }))
    const html = render(measuredSession(samples))
    expect(html).toContain('Longest Deep Focus block')
    expect(html).toContain('Lapses')
    expect(html).toContain('1 in this session')
    expect(html).toContain('Recovery')
    expect(html).toContain('App switches')
  })

  it('renders nothing when no measure could be computed', () => {
    expect(render({ actualSeconds: 20, measuredSeconds: 0, focusedSeconds: 0, timeline: [] })).toBe('')
  })
})
