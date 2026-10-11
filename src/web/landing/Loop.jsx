import { useRef, useState } from 'react'
import { DEMO_SESSION, DEMO_WEEK, formatClock, formatHoursMinutes } from './demoData'
import { useProgress, useSeen } from './motion'
import plannerShot from './assets/session-planner.webp'
import reportShot from './assets/session-report.webp'
import weekShot from './assets/week-review.webp'

// Measure → Understand → Improve. Each step draws its own graphic from the
// sample data, and can swap to the real app screen it stands for.

function MeasureGraphic({ run }) {
  const progress = useProgress(run, 5200, 200)
  const { scores, intervalSeconds, startedAt } = DEMO_SESSION
  const count = scores.length
  const shown = Math.max(2, Math.round(progress * count))
  const live = scores[shown - 1]
  const y = score => 8 + (1 - score / 100) * 84
  const line = scores.slice(0, shown).map((score, index) => `${(index / (count - 1)) * 100},${y(score).toFixed(2)}`).join(' ')
  return (
    <div className="site-graphic is-measure">
      <div className="site-graphic-top">
        <b>{live}</b>
        <span>{formatClock(startedAt + (shown - 1) * intervalSeconds * 1000)}</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect className="site-graphic-band" x="0" y={y(100)} width="100" height={y(72) - y(100)} />
        <line className="site-graphic-rule" x1="0" x2="100" y1={y(40)} y2={y(40)} />
        <polyline className="site-graphic-line" points={line} />
      </svg>
      <div className="site-graphic-foot"><span>Attention, live</span><span>{DEMO_SESSION.task}</span></div>
    </div>
  )
}

function UnderstandGraphic({ run }) {
  const progress = useProgress(run, 1600, 150)
  const count = useProgress(run, 1400, 900)
  const { segments, scores, lapses, recoverySeconds, longestDeepMinutes } = DEMO_SESSION
  return (
    <div className="site-graphic is-understand">
      <div className="site-graphic-bar" style={{ clipPath: `inset(0 ${(1 - progress) * 100}% 0 0 round 4px)` }} aria-hidden="true">
        {segments.map(segment => (
          <i key={segment.start} className={`is-${segment.kind}`} style={{ width: `${((segment.end - segment.start) / scores.length) * 100}%` }} />
        ))}
      </div>
      <div className="site-graphic-legend" aria-hidden="true"><span className="is-high">High</span><span className="is-focused">Focused</span><span className="is-low">Low</span></div>
      <dl className="site-graphic-stats">
        <div><dt>Lapses</dt><dd>{Math.round(lapses.length * count)}</dd></div>
        <div><dt>Back in</dt><dd>{Math.round((recoverySeconds ?? 0) * count)}<small> s</small></dd></div>
        <div><dt>Longest deep focus</dt><dd>{Math.round(longestDeepMinutes * count)}<small> min</small></dd></div>
      </dl>
    </div>
  )
}

function ImproveGraphic({ run }) {
  const progress = useProgress(run, 1500, 150)
  const max = Math.max(...DEMO_WEEK.thisWeek, ...DEMO_WEEK.lastWeek)
  return (
    <div className="site-graphic is-improve">
      <div className="site-graphic-top">
        <b>{formatHoursMinutes(Math.round(DEMO_WEEK.totalMinutes * progress))}</b>
        <span className="is-up">+{Math.round(DEMO_WEEK.deltaMinutes * progress)} min vs last week</span>
      </div>
      <div className="site-graphic-week" aria-hidden="true">
        {DEMO_WEEK.days.map((day, index) => (
          <div key={day}>
            <span className="site-week-col">
              <i className="is-last" style={{ height: `${(DEMO_WEEK.lastWeek[index] / max) * 100}%` }} />
              <i className="is-this" style={{ height: `${(DEMO_WEEK.thisWeek[index] / max) * 100 * progress}%` }} />
            </span>
            <small>{day}</small>
          </div>
        ))}
      </div>
      <div className="site-graphic-foot"><span><i className="is-this" />This week</span><span><i className="is-last" />Last week</span></div>
    </div>
  )
}

const STEPS = [
  {
    id: 'measure',
    name: 'Measure',
    title: 'Start a session. Then just work.',
    body: 'The camera estimates your attention on your Mac, second by second. Nothing asks you a question while you work.',
    Graphic: MeasureGraphic,
    shot: plannerShot,
    shotAlt: 'Starting a session in the app: a name, a length and recent setups',
  },
  {
    id: 'understand',
    name: 'Understand',
    title: 'See how it really went.',
    body: 'Every session ends with a report: when attention held, when it slipped, and how quickly you came back.',
    Graphic: UnderstandGraphic,
    shot: reportShot,
    shotAlt: 'A session report in the app with its attention timeline',
  },
  {
    id: 'improve',
    name: 'Improve',
    title: 'Get better, week by week.',
    body: 'Each day against your own usual, each week against the last. Over time, it shows your best hours.',
    Graphic: ImproveGraphic,
    shot: weekShot,
    shotAlt: 'The week in review in the app',
  },
]

function Step({ step }) {
  const ref = useRef(null)
  const seen = useSeen(ref, 0.4)
  const [inApp, setInApp] = useState(false)
  const { Graphic } = step
  return (
    <article className="site-step site-rv" ref={ref}>
      <p className="site-step-name">{step.name}</p>
      <h3>{step.title}</h3>
      <p className="site-step-body">{step.body}</p>
      <div className={`site-step-stage${inApp ? ' is-app' : ''}`}>
        <div className="site-step-layer is-graphic" aria-hidden={inApp}><Graphic run={seen} /></div>
        <div className="site-step-layer is-shot" aria-hidden={!inApp}>
          <img src={step.shot} alt={inApp ? step.shotAlt : ''} loading="lazy" />
        </div>
      </div>
      <button type="button" className="site-step-toggle" aria-pressed={inApp} onClick={() => setInApp(value => !value)}>
        {inApp ? 'Back to the graphic' : 'See it in the app'}
      </button>
    </article>
  )
}

export default function Loop() {
  return (
    <div className="site-loop">
      {STEPS.map(step => <Step key={step.id} step={step} />)}
    </div>
  )
}
