import { useEffect, useRef } from 'react'
import { ART_SESSIONS, band, smooth } from './dataArt'
import { DEMO_DAY, formatHoursMinutes } from './demoData'
import { prefersReducedMotion, useProgress, useSeen } from './motion'

// "Your week, drawn": the sample week as a clock of the working day. Each ring
// is one day, the oldest innermost and today on the outside; the dial runs
// from 07:00 at the top round to 19:00. Every session sits on its day's ring
// at the time it really ran, as long as it lasted. The line swells with
// attention and takes the colour of its band: deep focus, focused, or a lapse.
// The Eudaimonai core sits in the middle with the day's Focus Score.
const SIZE = 520
const CENTER = SIZE / 2
const INNER = 108
const OUTER = 236
const DAY_START = 7
const DAY_HOURS = 12
const COLORS = { deep: '#2C46FF', focused: '#9AA8FF', low: '#E8B10A' }

const dayKey = ms => new Date(ms).toDateString()
const LAST = ART_SESSIONS[ART_SESSIONS.length - 1].startedAt
const DAYS = Array.from({ length: 7 }, (_, index) => {
  const date = new Date(LAST)
  date.setDate(date.getDate() - 6 + index)
  return { key: dayKey(date), label: date.toLocaleDateString('en-GB', { weekday: 'short' }) }
})
const angleAt = hours => -Math.PI / 2 + ((hours - DAY_START) / DAY_HOURS) * Math.PI * 2
const hoursOf = ms => { const date = new Date(ms); return date.getHours() + date.getMinutes() / 60 }

function draw(canvas, progress) {
  // jsdom (tests) has no canvas; there is nothing to draw into.
  if (/jsdom/i.test(navigator.userAgent)) return
  const ratio = window.devicePixelRatio || 1
  const context = canvas.getContext('2d')
  if (!context) return
  canvas.width = SIZE * ratio
  canvas.height = SIZE * ratio
  context.scale(ratio, ratio)
  context.clearRect(0, 0, SIZE, SIZE)
  const step = (OUTER - INNER) / (DAYS.length - 1)

  // Faint day rings and hour ticks: the clock face.
  context.lineWidth = 1
  context.strokeStyle = 'rgba(20, 30, 90, .07)'
  DAYS.forEach((_, ring) => {
    context.beginPath()
    context.arc(CENTER, CENTER, INNER + ring * step, 0, Math.PI * 2)
    context.stroke()
  })
  context.strokeStyle = 'rgba(20, 30, 90, .18)'
  for (let hour = DAY_START; hour < DAY_START + DAY_HOURS; hour++) {
    const angle = angleAt(hour)
    const from = OUTER + 14
    const to = OUTER + (hour % 3 === 1 ? 24 : 19)
    context.beginPath()
    context.moveTo(CENTER + Math.cos(angle) * from, CENTER + Math.sin(angle) * from)
    context.lineTo(CENTER + Math.cos(angle) * to, CENTER + Math.sin(angle) * to)
    context.stroke()
  }
  context.fillStyle = '#86868B'
  context.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (const hour of [7, 10, 13, 16]) {
    const angle = angleAt(hour)
    context.fillText(`${String(hour).padStart(2, '0')}:00`, CENTER + Math.cos(angle) * (OUTER + 40), CENTER + Math.sin(angle) * (OUTER + 40))
  }

  // Sessions, drawn day by day from the inside out.
  context.lineCap = 'round'
  context.lineWidth = 5
  ART_SESSIONS.forEach((session, index) => {
    const ring = DAYS.findIndex(day => day.key === dayKey(session.startedAt))
    if (ring < 0) return
    const local = Math.max(0, Math.min(1, progress * 1.5 - index / ART_SESSIONS.length * 0.5))
    if (local <= 0) return
    // The shape is smoothed; the colour reads the raw samples, so lapses show.
    const raw = session.scores
    const scores = smooth(raw, 1)
    const start = hoursOf(session.startedAt)
    const radius = INNER + ring * step
    const points = Math.max(2, Math.round(scores.length * local))
    const at = i => {
      const angle = angleAt(start + (i / (scores.length - 1)) * (session.minutes / 60))
      const r = radius + ((scores[i] - 70) / 30) * step * 0.4
      return [CENTER + Math.cos(angle) * r, CENTER + Math.sin(angle) * r]
    }
    for (let i = 1; i < points; i++) {
      context.strokeStyle = COLORS[band(raw[i])]
      context.beginPath()
      context.moveTo(...at(i - 1))
      context.lineTo(...at(i))
      context.stroke()
    }
  })

  // Day initials just left of 07:00, from Mon inside to today outside.
  context.fillStyle = '#86868B'
  context.font = '500 10px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.textAlign = 'right'
  DAYS.forEach((day, ring) => {
    context.fillText(day.label.slice(0, 2), CENTER - 8, CENTER - (INNER + ring * step))
  })
}

const MEASURES = [
  { tone: 'ink', label: 'Session time', value: p => formatHoursMinutes(Math.round(DEMO_DAY.sessionMinutes * p)) },
  { tone: 'ultra', label: 'Attention', value: p => `${Math.round(DEMO_DAY.attention * p)}`, unit: '/100' },
  { tone: 'sky', label: 'Deep focus', value: p => formatHoursMinutes(Math.round(DEMO_DAY.deepFocusMinutes * p)) },
]

export default function WeekPortrait() {
  const ref = useRef(null)
  const canvasRef = useRef(null)
  const seen = useSeen(ref, 0.2)
  const progress = useProgress(seen, 3200, 100)
  const count = useProgress(seen, 1600, 900)

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, prefersReducedMotion() ? 1 : progress)
  }, [progress])

  return (
    <figure className="site-portrait" ref={ref}>
      <div className="site-portrait-art">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`A sample week as a clock of the working day: ${ART_SESSIONS.length} focus sessions placed at the time they ran, one ring per day, coloured by attention. Mostly deep focus in the mornings, a few lapses.`}
        />
        <div className="site-portrait-core" aria-hidden="true">
          <b>{Math.round(DEMO_DAY.score * count)}</b>
          <span>Focus Score</span>
        </div>
      </div>
      <dl className="site-hero-measures">
        {MEASURES.map(item => (
          <div key={item.label} className={`is-${item.tone}`}>
            <dt>{item.label}</dt>
            <dd>{item.value(count)}{item.unit && <small>{item.unit}</small>}</dd>
          </div>
        ))}
      </dl>
      <figcaption>
        <span className="site-portrait-key"><i className="is-deep" />Deep focus</span>
        <span className="site-portrait-key"><i className="is-focused" />Focused</span>
        <span className="site-portrait-key"><i className="is-low" />Lapse</span>
        <span>A week on the clock of the working day, one ring per day. Sample data.</span>
      </figcaption>
    </figure>
  )
}
