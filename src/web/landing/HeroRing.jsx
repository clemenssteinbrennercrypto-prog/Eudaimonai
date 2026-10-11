import { useRef } from 'react'
import { DEMO_DAY, formatHoursMinutes } from './demoData'
import { useProgress, useSeen } from './motion'

// The brand mark doing its job: the app's three Focus Score rings, drawn for
// the sample day, with the score and its three measures counting up beside
// them. Outer ring = time in sessions, middle = attention, inner = deep focus.
const RINGS = [
  { r: 172, tone: 'ink', label: 'Session time', value: p => formatHoursMinutes(Math.round(DEMO_DAY.sessionMinutes * p)) },
  { r: 146, tone: 'ultra', label: 'Attention', value: p => `${Math.round(DEMO_DAY.attention * p)}`, unit: '/100' },
  { r: 120, tone: 'sky', label: 'Deep focus', value: p => formatHoursMinutes(Math.round(DEMO_DAY.deepFocusMinutes * p)) },
]

export default function HeroRing() {
  const ref = useRef(null)
  const seen = useSeen(ref, 0.25)
  const draw = useProgress(seen, 1800, 150)
  const count = useProgress(seen, 1600, 350)

  return (
    <figure className={`site-hero-ring${draw >= 1 ? ' is-done' : ''}`} ref={ref} aria-label={`A sample day: Focus Score ${DEMO_DAY.score}, ${formatHoursMinutes(DEMO_DAY.sessionMinutes)} in sessions, attention ${DEMO_DAY.attention}, ${formatHoursMinutes(DEMO_DAY.deepFocusMinutes)} of deep focus`}>
      <div className="site-hero-ring-dial" aria-hidden="true">
        <svg viewBox="0 0 400 400">
          {RINGS.map((ring, index) => {
            const length = 2 * Math.PI * ring.r
            const share = DEMO_DAY.rings[index] * Math.min(1, Math.max(0, draw * 1.25 - index * 0.12))
            return (
              <g key={ring.r} className={`is-${ring.tone}`}>
                <circle className="site-dial-track" cx="200" cy="200" r={ring.r} />
                <circle
                  className="site-dial-arc"
                  cx="200"
                  cy="200"
                  r={ring.r}
                  strokeDasharray={length}
                  strokeDashoffset={length * (1 - share)}
                />
              </g>
            )
          })}
        </svg>
        <div className="site-dial-center">
          <b>{Math.round(DEMO_DAY.score * count)}</b>
          <span>Focus Score</span>
        </div>
      </div>
      <dl className="site-hero-measures">
        {RINGS.map(ring => (
          <div key={ring.label} className={`is-${ring.tone}`}>
            <dt>{ring.label}</dt>
            <dd>{ring.value(count)}{ring.unit && <small>{ring.unit}</small>}</dd>
          </div>
        ))}
      </dl>
      <figcaption>{DEMO_DAY.label} · your usual day {DEMO_DAY.usual} · sample data</figcaption>
    </figure>
  )
}
