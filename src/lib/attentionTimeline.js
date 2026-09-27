import { FOCUSED_SCORE, GOOD_STREAK_SCORE } from './attention'

// Timeline snapshots are stored every five active seconds. They preserve when
// a band occurred, but remain a coarse visual trace rather than a second exact
// duration accumulator. Exact Focused and Deep Focus totals continue to come
// from their dedicated session counters.
const MAX_TIMELINE_SPAN_SECONDS = 5

export const ATTENTION_TIMELINE_BANDS = Object.freeze({
  deep: { id: 'deep', label: 'Deep Focus' },
  high: { id: 'high', label: 'High attention' },
  focused: { id: 'focused', label: 'Focused' },
  low: { id: 'low', label: 'Low attention' },
  unmeasured: { id: 'unmeasured', label: 'Not measured' },
})

function scoreOf(sample) {
  if (Number.isFinite(sample?.score)) return sample.score
  if (sample?.focused === true) return FOCUSED_SCORE
  return null
}

/** Classify one stored sample without relabelling a high score as Deep Focus. */
export function attentionTimelineBand(sample) {
  const score = scoreOf(sample)
  if (score == null) return ATTENTION_TIMELINE_BANDS.unmeasured
  if (sample?.deepFocused === true) return ATTENTION_TIMELINE_BANDS.deep
  if (score >= GOOD_STREAK_SCORE) return ATTENTION_TIMELINE_BANDS.high
  if (score >= FOCUSED_SCORE) return ATTENTION_TIMELINE_BANDS.focused
  return ATTENTION_TIMELINE_BANDS.low
}

/**
 * Estimate how much sampled time sits in each visual band. This is used only
 * to split the exact Focused total into High vs ordinary Focused in the legend;
 * it never replaces the exact stored Deep Focus or Focused accumulators.
 */
export function sampledAttentionBandSeconds(timeline = []) {
  const totals = { deep: 0, high: 0, focused: 0, low: 0, unmeasured: 0 }
  const points = (Array.isArray(timeline) ? timeline : [])
    .filter(point => Number.isFinite(point?.second))
    .sort((a, b) => a.second - b.second)
  let previousSecond = 0

  for (const point of points) {
    const seconds = Math.min(MAX_TIMELINE_SPAN_SECONDS, Math.max(0, point.second - previousSecond))
    previousSecond = point.second
    totals[attentionTimelineBand(point).id] += seconds
  }
  return totals
}
