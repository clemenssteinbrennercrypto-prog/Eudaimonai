import { useEffect, useMemo, useRef, useState } from 'react'
import demoSession from './assets/demo-session.json'

// The page's signature: one real session's attention, drawn as it happened.
// The data is the sample session behind the report screenshot, exported by
// scripts/website-shots/shoot.mjs, so line, labels and screenshot agree.
//
// Bands follow the app (src/lib/attention.js): focused from 40, Deep Focus
// band from 72. A lapse is below 40 for two or more samples (10 s), the same
// hold as sessionMeasures.js.
const FOCUSED = 40
const DEEP = 72
const WIDTH = 1000
const HEIGHT = 220
const PAD_TOP = 18
const PAD_BOTTOM = 26
const DRAW_MS = 5200

function clock(ms) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// Whole minutes: the trace is sampled every 5 s, so seconds would disagree
// with the app's own report by a sample.
function duration(seconds) {
  return seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`
}

function analyse({ scores, intervalSeconds }) {
  const lapses = []
  let runStart = null
  scores.forEach((score, index) => {
    const low = score < FOCUSED
    if (low && runStart === null) runStart = index
    if ((!low || index === scores.length - 1) && runStart !== null) {
      const end = low ? index + 1 : index
      if (end - runStart >= 2) lapses.push({ start: runStart, end })
      runStart = null
    }
  })
  let longest = { start: 0, end: 0 }
  let deepStart = null
  scores.forEach((score, index) => {
    const deep = score >= DEEP
    if (deep && deepStart === null) deepStart = index
    if ((!deep || index === scores.length - 1) && deepStart !== null) {
      const end = deep ? index + 1 : index
      if (end - deepStart > longest.end - longest.start) longest = { start: deepStart, end }
      deepStart = null
    }
  })
  const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
  return { lapses, longest, average, seconds: scores.length * intervalSeconds }
}

// A centred 15 s average for the drawn line only; facts use the raw samples.
function smooth(scores) {
  return scores.map((_, index) => {
    const window = scores.slice(Math.max(0, index - 1), index + 2)
    return window.reduce((sum, score) => sum + score, 0) / window.length
  })
}

const x = (index, count) => (index / (count - 1)) * WIDTH
const y = score => PAD_TOP + (1 - score / 100) * (HEIGHT - PAD_TOP - PAD_BOTTOM)

export default function AttentionTrace() {
  const { scores, intervalSeconds, startedAt, task } = demoSession
  const facts = useMemo(() => analyse(demoSession), [])
  const path = useMemo(() => smooth(scores).map((score, index) => `${index ? 'L' : 'M'}${x(index, scores.length).toFixed(1)} ${y(score).toFixed(1)}`).join(''), [scores])
  const lineRef = useRef(null)
  const rootRef = useRef(null)
  const [progress, setProgress] = useState(1)

  // Draw once when it comes into view; a live readout follows the pen.
  useEffect(() => {
    const root = rootRef.current
    const line = lineRef.current
    if (!root || !line) return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined
    let frame = 0
    let start = 0
    setProgress(0)
    const step = now => {
      start ||= now
      const t = Math.min(1, (now - start) / DRAW_MS)
      setProgress(1 - (1 - t) ** 2.2)
      if (t < 1) frame = requestAnimationFrame(step)
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      frame = requestAnimationFrame(step)
    }, { threshold: 0.35 })
    observer.observe(root)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  const count = scores.length
  const index = Math.max(0, Math.min(count - 1, Math.round(progress * (count - 1))))
  const live = scores[index]
  const elapsed = index * intervalSeconds
  const penX = x(index, count)
  const lapse = facts.lapses[0]
  const done = progress >= 1
  const pct = value => `${(value / (count - 1)) * 100}%`

  return (
    <figure className="site-trace" ref={rootRef} aria-label={`Attention through a ${Math.round(facts.seconds / 60)}-minute session: average ${facts.average}, ${facts.lapses.length} lapses, longest Deep Focus stretch ${duration((facts.longest.end - facts.longest.start) * intervalSeconds)}`}>
      <div className="site-trace-head" aria-hidden="true">
        <span>Attention · one session · {task}</span>
        <span className="site-trace-live">
          <b>{done ? facts.average : live}</b>
          <i>{done ? 'average' : clock(startedAt + elapsed * 1000)}</i>
        </span>
      </div>
      <div className="site-trace-plot">
        <span
          className={`site-trace-bracket${index >= facts.longest.end ? ' is-on' : ''}`}
          aria-hidden="true"
          style={{ left: pct(facts.longest.start), width: `calc(${pct(facts.longest.end)} - ${pct(facts.longest.start)})` }}
        >
          <b>Longest Deep Focus · {duration((facts.longest.end - facts.longest.start) * intervalSeconds)}</b>
        </span>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          <rect className="site-trace-deep" x="0" y={y(100)} width={WIDTH} height={y(DEEP) - y(100)} />
          <line className="site-trace-rule" x1="0" x2={WIDTH} y1={y(DEEP)} y2={y(DEEP)} />
          <line className="site-trace-rule" x1="0" x2={WIDTH} y1={y(FOCUSED)} y2={y(FOCUSED)} />
          <path
            ref={lineRef}
            className="site-trace-line"
            d={path}
            pathLength="1"
            style={{ strokeDasharray: 1, strokeDashoffset: 1 - progress }}
          />
          {facts.lapses.map(item => (
            <rect
              key={item.start}
              className={`site-trace-lapse${index >= item.start ? ' is-on' : ''}`}
              x={x(item.start, count)}
              y={y(FOCUSED)}
              width={Math.max(3, x(item.end, count) - x(item.start, count))}
              height={y(0) - y(FOCUSED)}
            />
          ))}
        </svg>
        {/* The pen is HTML so it stays round while the chart stretches. */}
        {progress < 1 && (
          <span className="site-trace-pen" aria-hidden="true" style={{ left: `${(penX / WIDTH) * 100}%`, top: `${(y(live) / HEIGHT) * 100}%` }} />
        )}
      </div>
      <div className="site-trace-notes" aria-hidden="true">
        <span style={{ left: '0%' }}>{clock(startedAt)} start</span>
        {lapse && (
          <span className={`is-lapse${index >= lapse.start ? ' is-on' : ''}`} style={{ left: pct(lapse.start) }}>
            Lapse · {duration((lapse.end - lapse.start) * intervalSeconds)}
          </span>
        )}
        <span className="is-end" style={{ right: '0%' }}>{clock(startedAt + facts.seconds * 1000)} end</span>
      </div>
      <figcaption className="site-trace-legend">
        <span><i className="is-band" />Deep Focus band, 72+</span>
        <span><i className="is-rule" />Focused, 40+</span>
        <span><i className="is-lapse" />Lapse, under 40 for 10 s or more</span>
      </figcaption>
    </figure>
  )
}
