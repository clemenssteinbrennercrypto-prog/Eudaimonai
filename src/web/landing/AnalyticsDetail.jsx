import { useRef } from 'react'
import analytics from './assets/demo-analytics.json'
import { useProgress, useSeen } from './motion'

// Analytics in detail, drawn from the sample history the screenshots use
// (exported by scripts/website-shots/shoot.mjs, matching the app's Details
// view): attention per session over the last weeks, and a 24-hour clock of
// when attention is highest.
const SESSIONS = analytics.sessions
const PERIODS = analytics.periods.filter(period => period.attention !== null)
const BEST = PERIODS.reduce((best, period) => (!best || period.attention > best.attention ? period : best), null)
const half = Math.floor(SESSIONS.length / 2)
const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length
const TREND = Math.round(mean(SESSIONS.slice(half)) - mean(SESSIONS.slice(0, half)))

// The line is a rolling average of seven sessions; single sessions are dots.
const ROLLING = SESSIONS.map((_, index) => mean(SESSIONS.slice(Math.max(0, index - 6), index + 1)))

function Trend({ progress }) {
  const count = SESSIONS.length
  const shown = Math.max(2, Math.round(progress * count))
  const y = value => 8 + (1 - (value - 40) / 60) * 84
  const x = index => (index / (count - 1)) * 100
  const points = ROLLING.slice(0, shown).map((value, index) => `${x(index)},${y(value).toFixed(2)}`).join(' ')
  const area = `0,100 ${points} ${x(shown - 1)},100`
  return (
    <div className="site-adetail-trend">
      <div className="site-adetail-head">
        <b>{Math.round(mean(SESSIONS.slice(half)))}</b>
        <span><i className="is-up">+{Math.max(0, Math.round(TREND * progress))}</i> average attention, recent sessions vs earlier</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line className="site-adetail-grid" x1="0" x2="100" y1={y(75)} y2={y(75)} />
        <line className="site-adetail-grid" x1="0" x2="100" y1={y(50)} y2={y(50)} />
        <polygon className="site-adetail-area" points={area} />
        {SESSIONS.slice(0, shown).map((value, index) => (
          <line key={index} className="site-adetail-dot" x1={x(index)} x2={x(index)} y1={y(value)} y2={y(value) + 0.01} />
        ))}
        <polyline className="site-adetail-line" points={points} />
      </svg>
      <div className="site-adetail-foot"><span>{SESSIONS.length} sessions · each dot is one</span><span>7-session average</span></div>
    </div>
  )
}

// A 24-hour dial: midnight at the top, each period an arc whose thickness
// grows with its average attention.
function Clock({ progress }) {
  const arc = (from, to, r) => {
    const a = h => ((h / 24) * 2 * Math.PI) - Math.PI / 2
    const x = h => 100 + Math.cos(a(h)) * r
    const yy = h => 100 + Math.sin(a(h)) * r
    return `M${x(from).toFixed(2)} ${yy(from).toFixed(2)} A${r} ${r} 0 0 1 ${x(to).toFixed(2)} ${yy(to).toFixed(2)}`
  }
  return (
    <div className="site-adetail-clock">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle className="site-adetail-dial" cx="100" cy="100" r="70" />
        {[0, 6, 12, 18].map(hour => {
          const a = ((hour / 24) * 2 * Math.PI) - Math.PI / 2
          return <text key={hour} className="site-adetail-tick" x={100 + Math.cos(a) * 92} y={100 + Math.sin(a) * 92 + 3}>{String(hour).padStart(2, '0')}</text>
        })}
        {PERIODS.map((period, index) => {
          const share = Math.max(0, Math.min(1, progress * 1.6 - index * 0.15))
          const width = 6 + ((period.attention - 55) / 30) * 22
          return (
            <path
              key={period.label}
              className={`site-adetail-arc${period === BEST ? ' is-best' : ''}`}
              d={arc(period.from + 0.15, period.to - 0.15, 70)}
              strokeWidth={Math.max(4, width) * share}
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - share}
            />
          )
        })}
        <text className="site-adetail-center" x="100" y="98">{BEST.attention}</text>
        <text className="site-adetail-center-sub" x="100" y="116">{BEST.label}</text>
      </svg>
      <ul className="site-adetail-periods">
        {PERIODS.map(period => (
          <li key={period.label} className={period === BEST ? 'is-best' : ''}>
            <span>{period.label}</span><b>{period.attention}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AnalyticsDetail() {
  const ref = useRef(null)
  const seen = useSeen(ref, 0.35)
  const progress = useProgress(seen, 2200, 200)
  return (
    <figure className="site-adetail site-rv" ref={ref} aria-label={`Analytics in detail, sample data: attention per session over ${SESSIONS.length} sessions, up ${TREND} points; best time of day ${BEST.label.toLowerCase()} at ${BEST.attention}.`}>
      <div className="site-adetail-copy">
        <p className="site-label">Analytics, in detail</p>
        <h3>Know your best hours.</h3>
        <p>Every session joins your history. Over the weeks you see whether your attention is rising, and which time of day holds it best, once there is enough data to say so.</p>
      </div>
      <Trend progress={progress} />
      <Clock progress={progress} />
    </figure>
  )
}
