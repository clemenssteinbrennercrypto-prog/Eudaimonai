import session from './assets/demo-session.json'
import week from './assets/demo-week.json'

// Sample data behind the landing page's graphics. Both files are exported by
// scripts/website-shots/shoot.mjs from the same seeded history as the
// screenshots, through the app's own scoring, so graphics and screens agree.
//
// Bands mirror the app's session report: high from 65, focused from 40, low
// below 40. A lapse is low for two samples (10 s) or more, and recovery runs
// from a lapse's start until attention holds at 40+ for two samples, as in
// sessionMeasures.js. Deep Focus band from 72.
const HIGH = 65
const FOCUSED = 40
const DEEP = 72

export const DEMO_DAY = {
  label: 'Thursday',
  score: 78,
  usual: 69,
  sessionMinutes: 185,
  attention: 78,
  deepFocusMinutes: 121,
  // Ring fractions as the app draws them: focus time against the day's
  // reference, average attention / 100, Deep Focus share of measured time.
  rings: [1, 0.78, 0.66],
}

export const DEMO_WEEK = {
  days: week.days,
  thisWeek: week.thisWeek,
  lastWeek: week.lastWeek,
  totalMinutes: week.thisWeek.reduce((sum, value) => sum + value, 0),
  deltaMinutes: week.thisWeek.reduce((sum, value) => sum + value, 0) - week.lastWeek.reduce((sum, value) => sum + value, 0),
}

function runs(scores, test) {
  const found = []
  let start = null
  scores.forEach((score, index) => {
    if (test(score) && start === null) start = index
    const last = index === scores.length - 1
    if (start !== null && (!test(score) || last)) {
      found.push({ start, end: test(score) && last ? index + 1 : index })
      start = null
    }
  })
  return found
}

function analyseSession({ scores, intervalSeconds, startedAt, task }) {
  const lapses = runs(scores, score => score < FOCUSED).filter(run => run.end - run.start >= 2)
  const recoveries = lapses.map(lapse => {
    for (let index = lapse.end; index < scores.length - 1; index++) {
      if (scores[index] >= FOCUSED && scores[index + 1] >= FOCUSED) return (index - lapse.start) * intervalSeconds
    }
    return null
  }).filter(Number.isFinite)
  const sorted = [...recoveries].sort((a, b) => a - b)
  const longestDeep = runs(scores, score => score >= DEEP).reduce((best, run) => (run.end - run.start > best ? run.end - run.start : best), 0)
  const band = score => (score >= HIGH ? 'high' : score >= FOCUSED ? 'focused' : 'low')
  const segments = scores.reduce((list, score, index) => {
    const kind = band(score)
    const last = list[list.length - 1]
    if (last && last.kind === kind) last.end = index + 1
    else list.push({ kind, start: index, end: index + 1 })
    return list
  }, [])
  return {
    task,
    startedAt,
    intervalSeconds,
    scores,
    minutes: Math.round((scores.length * intervalSeconds) / 60),
    average: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    lapses,
    recoverySeconds: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    longestDeepMinutes: Math.round((longestDeep * intervalSeconds) / 60),
    segments,
  }
}

export const DEMO_SESSION = analyseSession(session)

export const formatHoursMinutes = minutes => `${Math.floor(minutes / 60)}h ${minutes % 60}m`

export const formatClock = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
