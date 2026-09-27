import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import TimelineBar from './TimelineBar'

describe('attention timeline presentation', () => {
  it('uses discrete semantic bands in chronological order', () => {
    const html = renderToString(<TimelineBar timeline={[
      { second: 5, score: 20 },
      { second: 10, score: 50 },
      { second: 15, score: 75 },
      { second: 20, score: 80, deepFocused: true },
    ]} />)

    expect(html.indexOf('Low attention')).toBeLessThan(html.indexOf('Focused'))
    expect(html.indexOf('Focused')).toBeLessThan(html.indexOf('High attention'))
    expect(html.indexOf('High attention')).toBeLessThan(html.indexOf('Deep Focus'))
    expect(html).toContain('background:#FF4D6A')
    expect(html).toContain('background:#FFB340')
    expect(html).toContain('background:#2FE3A8')
  })
})
