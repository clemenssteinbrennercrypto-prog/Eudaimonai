import { useRef } from 'react'
import { DEMO_SESSION, formatClock } from './demoData'
import { useProgress, useSeen } from './motion'

// One sample session, read the way the app reads it. The line is the real
// sample trace; the moments below it are where it changes, with a small top
// view of the desk showing what the person was doing. The second-screen
// glance is a moment inside the longest deep focus stretch: the workspace
// knows where that display is, so the score does not drop.
const S = DEMO_SESSION
const at = index => S.startedAt + index * S.intervalSeconds * 1000
const count = S.scores.length
const lapse = S.firstLapse
const deep = S.longestDeepRun
// A centred 15 s average for the drawn line only; moments use the raw samples.
const SMOOTH = S.scores.map((_, index) => {
  const window = S.scores.slice(Math.max(0, index - 1), index + 2)
  return window.reduce((sum, score) => sum + score, 0) / window.length
})
const glance = Math.round(deep.start + (deep.end - deep.start) * 0.3)

const MOMENTS = [
  { id: 'start', index: 0, view: 'start', title: 'You start a session', body: 'Name the task, pick a length, go. A few seconds to calibrate, then it measures.' },
  { id: 'glance', index: glance, view: 'side', title: 'A look at your second screen', body: 'It knows where that display is, so it still counts as work.' },
  { id: 'deep', index: Math.round(deep.start + (deep.end - deep.start) * 0.72), view: 'main', title: `${S.longestDeepMinutes} minutes, unbroken`, body: 'Steady attention for this long becomes deep focus, your longest stretch today.' },
  { id: 'lapse', index: lapse.start, view: 'phone', title: 'You check your phone', body: `Attention drops below focus for ${Math.round(((lapse.end - lapse.start) * S.intervalSeconds))} seconds. That is a lapse.` },
  { id: 'back', index: lapse.recoveredAt, view: 'main', title: 'You come back', body: `Focused again ${Math.round((lapse.recoveredAt - lapse.start) * S.intervalSeconds)} seconds after you looked away. The report keeps how fast you recover.` },
]

// A top view of the desk: two screens, a phone, and where the head is facing.
function DeskView({ view }) {
  const cone = {
    main: 'M60 66 L44 22 L76 22 Z',
    side: 'M60 66 L84 26 L108 38 Z',
    phone: 'M60 66 L30 78 L36 90 Z',
    start: 'M60 66 L44 22 L76 22 Z',
  }[view]
  return (
    <svg className="site-desk" viewBox="0 0 120 100" aria-hidden="true">
      <rect className="site-desk-screen" x="38" y="12" width="44" height="6" rx="2" />
      <rect className="site-desk-screen is-side" x="88" y="22" width="26" height="6" rx="2" transform="rotate(28 101 25)" />
      <rect className="site-desk-phone" x="18" y="78" width="12" height="18" rx="3" />
      <path className={`site-desk-cone is-${view}`} d={cone} />
      <circle className="site-desk-head" cx="60" cy="70" r="9" />
      {view === 'start' && <path className="site-desk-play" d="M56 65 L66 70 L56 75 Z" />}
    </svg>
  )
}

export default function SessionWalkthrough() {
  const ref = useRef(null)
  const seen = useSeen(ref, 0.3)
  const progress = useProgress(seen, 7000, 300)
  const shown = Math.max(2, Math.round(progress * count))
  const y = score => 6 + (1 - score / 100) * 88
  const line = SMOOTH.slice(0, shown).map((score, index) => `${(index / (count - 1)) * 1000},${y(score).toFixed(2)}`).join(' ')
  const pct = index => `${(index / (count - 1)) * 100}%`

  return (
    <div className="site-walk" ref={ref}>
      <div className="site-walk-panel">
        <div className="site-walk-top">
          <span>{S.task}</span>
          <span>{formatClock(at(0))}–{formatClock(at(count))} · sample session</span>
        </div>
        <div className="site-walk-plot">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
            <rect className="site-walk-band" x="0" y={y(100)} width="1000" height={y(72) - y(100)} />
            <line className="site-walk-rule" x1="0" x2="1000" y1={y(40)} y2={y(40)} />
            <rect
              className={`site-walk-deep${shown > deep.end ? ' is-on' : ''}`}
              x={(deep.start / (count - 1)) * 1000}
              y="0"
              width={((deep.end - deep.start) / (count - 1)) * 1000}
              height="100"
            />
            <polyline className="site-walk-line" points={line} />
          </svg>
          {MOMENTS.map((moment, number) => (
            <span
              key={moment.id}
              className={`site-walk-marker${shown > moment.index ? ' is-on' : ''}`}
              style={{ left: pct(moment.index), top: `${y(S.scores[moment.index])}%` }}
              aria-hidden="true"
            >
              {number + 1}
            </span>
          ))}
        </div>
        <div className="site-walk-axis" aria-hidden="true">
          <span>{formatClock(at(0))}</span>
          <span>{formatClock(at(Math.round(count / 2)))}</span>
          <span>{formatClock(at(count))}</span>
        </div>
      </div>
      <ol className="site-moments">
        {MOMENTS.map((moment, number) => (
          <li key={moment.id} className={shown > moment.index ? 'is-on' : ''}>
            <DeskView view={moment.view} />
            <span className="site-moment-time"><b>{number + 1}</b>{formatClock(at(moment.index))}</span>
            <h3>{moment.title}</h3>
            <p>{moment.body}</p>
          </li>
        ))}
      </ol>
      <p className={`site-walk-end${progress >= 1 ? ' is-on' : ''}`}>
        <b>{formatClock(at(count))} · Session over.</b> The report: average attention {S.average}, {S.lapses.length} lapses,
        longest deep focus {S.longestDeepMinutes} minutes. It adds to your day, your week, and your best hours.
      </p>
    </div>
  )
}
