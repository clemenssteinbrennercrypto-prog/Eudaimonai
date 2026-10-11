import art from './assets/demo-art.json'

// The data behind the page's art: every session of one sample week, oldest
// first, each resampled to 160 points (exported by scripts/website-shots).
// Bands follow the app: deep focus from 72, focused from 40, lapse below.
export const ART_SESSIONS = art

export const band = score => (score >= 72 ? 'deep' : score >= 40 ? 'focused' : 'low')

// A light smoothing for drawing only; it keeps the shape and drops jitter.
export function smooth(scores, radius = 1) {
  return scores.map((_, index) => {
    const window = scores.slice(Math.max(0, index - radius), index + radius + 1)
    return window.reduce((sum, value) => sum + value, 0) / window.length
  })
}
