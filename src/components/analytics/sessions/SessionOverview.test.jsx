import { describe, expect, it } from 'vitest'
import { buildAttentionTimes } from './SessionOverview'

describe('historical session attention time', () => {
  it('shows mutually exclusive durations and keeps breaks separate', () => {
    const entries = buildAttentionTimes({
      pausedSeconds: 120,
      timeline: [
        { second: 5, score: 78 },
        { second: 10, score: 82, deepFocused: true },
        { second: 15, score: 52 },
      ],
    }, {
      actualSeconds: 1200,
      measuredSeconds: 1100,
      focusedSeconds: 700,
      deepFocusSeconds: 200,
    })

    expect(entries).toEqual([
      { id: 'deep', label: 'Deep Focus', seconds: 200 },
      { id: 'high', label: 'High attention', seconds: 5 },
      { id: 'focused', label: 'Focused', seconds: 495 },
      { id: 'low', label: 'Low attention', seconds: 400 },
      { id: 'unmeasured', label: 'Not measured', seconds: 100 },
      { id: 'break', label: 'Break', seconds: 120 },
    ])
  })

  it('does not invent high-attention time for older sessions', () => {
    const entries = buildAttentionTimes({}, {
      actualSeconds: 600,
      measuredSeconds: 600,
      focusedSeconds: 420,
      deepFocusSeconds: null,
    })

    expect(entries).toEqual([
      { id: 'focused', label: 'Focused', seconds: 420 },
      { id: 'low', label: 'Low attention', seconds: 180 },
    ])
  })

  it('keeps a zero Deep Focus section visible for new sessions', () => {
    const entries = buildAttentionTimes({ timeline: [{ second: 5, score: 70 }] }, {
      actualSeconds: 600,
      measuredSeconds: 600,
      focusedSeconds: 420,
      deepFocusSeconds: 0,
    })

    expect(entries[0]).toEqual({ id: 'deep', label: 'Deep Focus', seconds: 0 })
    expect(entries[1]).toEqual({ id: 'high', label: 'High attention', seconds: 5 })
  })

  it('keeps missing camera time visible instead of counting it as low attention', () => {
    const entries = buildAttentionTimes({}, {
      actualSeconds: 600,
      measuredSeconds: null,
      focusedSeconds: null,
      deepFocusSeconds: null,
    })

    expect(entries).toEqual([
      { id: 'focused', label: 'Focused', seconds: 0 },
      { id: 'low', label: 'Low attention', seconds: 0 },
      { id: 'unmeasured', label: 'Not measured', seconds: 600 },
    ].filter(item => item.seconds > 0))
  })
})
