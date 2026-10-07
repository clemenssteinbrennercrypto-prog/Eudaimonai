import { describe, expect, it } from 'vitest'
import { deriveSessionMeasures } from './sessionMeasures'

// Builds a 5 s timeline from a compact pattern: one character per sample.
//   F = focused (score 70), L = low (score 30), D = Deep Focus (score 80)
//   _ = a hole (break or camera gap): no sample for that slot
function timeline(pattern, { apps = null, start = 5 } = {}) {
  const samples = []
  ;[...pattern].forEach((char, index) => {
    if (char === '_') return
    const score = char === 'L' ? 30 : char === 'D' ? 80 : 70
    const sample = {
      second: start + index * 5,
      score,
      focused: score >= 40,
      deepFocused: char === 'D',
      inFlow: char === 'D',
    }
    if (apps) sample.activity = { kind: 'aligned', label: 'title', app: apps[index] ?? '', domain: '' }
    samples.push(sample)
  })
  return samples
}

function session(pattern, overrides = {}) {
  const tl = overrides.timeline ?? timeline(pattern, overrides)
  const measuredSeconds = overrides.measuredSeconds ?? tl.length * 5
  return {
    actualSeconds: measuredSeconds + 60,
    measuredSeconds,
    focusedSeconds: tl.filter(s => s.focused).length * 5,
    avgFocusScore: 65,
    deepFocusTimeVersion: 2,
    flowSeconds: overrides.flowSeconds ?? tl.filter(s => s.deepFocused).length * 5 + 90,
    timeline: tl,
    ...overrides.record,
  }
}

const FOCUS_HOUR = 'F'.repeat(60) // 5 min of focused samples

describe('deriveSessionMeasures', () => {
  it('counts a lapse only once it has held for 10 s', () => {
    // One low sample is noise; two are a lapse.
    const measures = deriveSessionMeasures(session(`${FOCUS_HOUR}LF${'F'.repeat(10)}LLFF${'F'.repeat(10)}`))
    expect(measures.lapses.count).toBe(1)
  })

  it('times recovery until attention has held again for 10 s, ignoring a one-sample blip', () => {
    // Lapse starts at index 60; a single focused blip at 62 does not end it;
    // attention is back for good at index 64.
    const measures = deriveSessionMeasures(session(`${FOCUS_HOUR}LLFLFF${'F'.repeat(10)}`))
    expect(measures.lapses.count).toBe(1)
    expect(measures.recovery.medianSeconds).toBe(20)
  })

  it('never counts across a break or camera gap', () => {
    // Low before the hole, focused after it: that is missing data, not a recovery.
    const measures = deriveSessionMeasures(session(`${FOCUS_HOUR}LL___FF${'F'.repeat(10)}`))
    expect(measures.lapses.count).toBe(1)
    expect(measures.recovery).toBeNull()
  })

  it('refuses per-hour rates below 5 measured minutes', () => {
    const measures = deriveSessionMeasures(session('FFFFLLFFFF'))
    expect(measures.lapses).toBeNull()
    expect(measures.switches).toBeNull()
  })

  it('reports lapses per measured hour', () => {
    const pattern = `${'F'.repeat(340)}LL${'F'.repeat(338)}LL${'F'.repeat(38)}` // 60 min
    const measures = deriveSessionMeasures(session(pattern))
    expect(measures.measuredSeconds).toBe(3600)
    expect(measures.lapses).toEqual({ count: 2, perHour: 2 })
  })

  it('finds the longest unbroken Deep Focus block, capped by the exact total', () => {
    const pattern = `${FOCUS_HOUR}DDDDFDDDDDDDDF_DDDDDDDDDDDDDD`
    const measures = deriveSessionMeasures(session(pattern))
    // 14 samples after the hole beat 8 before it; the proven Flow entry adds
    // the same 90 s qualifying span that flowSeconds already credited.
    expect(measures.longestDeepFocusSeconds).toBe(160)
    expect(deriveSessionMeasures(session(pattern, { flowSeconds: 40 })).longestDeepFocusSeconds).toBe(40)
  })

  it('does not credit the warm-up twice after a retained Flow interruption', () => {
    const tl = timeline(`${FOCUS_HOUR}DDDDDD`).map((sample, index) => {
      if (index === 63) return { ...sample, deepFocused: false, inFlow: true }
      return sample
    })
    const measures = deriveSessionMeasures(session('', { timeline: tl, flowSeconds: 115 }))
    // First run: 90 s warm-up + 15 s stamped. Second run resumes the retained
    // gate and contributes only its 10 s of stamped time.
    expect(measures.longestDeepFocusSeconds).toBe(105)
  })

  it('refuses to reconstruct a block when historical samples lack Flow gate state', () => {
    const tl = timeline(`${FOCUS_HOUR}DDDD`).map(({ inFlow, ...sample }) => sample)
    expect(deriveSessionMeasures(session('', { timeline: tl })).longestDeepFocusSeconds).toBeNull()
  })

  it('leaves the block unknown for sessions without exact Deep Focus', () => {
    const measures = deriveSessionMeasures(session(`${FOCUS_HOUR}DDDD`, { record: { deepFocusTimeVersion: undefined } }))
    expect(measures.longestDeepFocusSeconds).toBeNull()
  })

  describe('context switches', () => {
    const steady = (app, n) => Array(n).fill(app)

    it('counts changes between contexts that each held 10 s', () => {
      const apps = [...steady('Code', 60), ...steady('Safari', 4), ...steady('Code', 6)]
      const measures = deriveSessionMeasures(session('F'.repeat(70), { apps }))
      expect(measures.switches.count).toBe(2)
    })

    it('ignores a 5 s detour that returns to the same context', () => {
      const apps = [...steady('Code', 60), 'Slack', ...steady('Code', 9)]
      const measures = deriveSessionMeasures(session('F'.repeat(70), { apps }))
      expect(measures.switches.count).toBe(0)
    })

    it('does not bridge an unknown reading', () => {
      const apps = [...steady('Code', 60), '', '', ...steady('Safari', 8)]
      const measures = deriveSessionMeasures(session('F'.repeat(70), { apps }))
      expect(measures.switches.count).toBe(0)
    })

    it('treats another site in the same browser as a switch', () => {
      const tl = timeline('F'.repeat(70)).map((sample, index) => ({
        ...sample,
        activity: { kind: 'aligned', label: 't', app: 'Safari', domain: index < 60 ? 'github.com' : 'youtube.com' },
      }))
      expect(deriveSessionMeasures(session('', { timeline: tl })).switches.count).toBe(1)
    })

    it('stays unknown for sessions recorded before samples carried the app', () => {
      // Older samples only have the window title as a label; counting title
      // changes would count every file switch and page load.
      const tl = timeline('F'.repeat(70)).map(sample => ({ ...sample, activity: { kind: 'aligned', label: `t${sample.second}` } }))
      expect(deriveSessionMeasures(session('', { timeline: tl })).switches).toBeNull()
    })

    it('stays unknown when the Companion never reported an app', () => {
      const apps = steady('', 70)
      expect(deriveSessionMeasures(session('F'.repeat(70), { apps })).switches).toBeNull()
    })
  })

  it('returns nothing for an unmeasured session', () => {
    const measures = deriveSessionMeasures({ actualSeconds: 600, measuredSeconds: 0, focusedSeconds: 0, timeline: [] })
    expect(measures).toMatchObject({ lapses: null, recovery: null, switches: null, longestDeepFocusSeconds: null })
  })
})
