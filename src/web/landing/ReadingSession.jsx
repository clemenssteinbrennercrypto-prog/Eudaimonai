import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { DEMO_SESSION, formatClock } from './demoData'
import { useSeen } from './motion'

// "The page is a session": opening the page starts a reading session. A small
// ring in the header fills as you scroll and a timer counts the time the page
// has been visible; every section stamps the time you reached it, and the end
// tells you how long you read. It all lives in this tab's memory: nothing is
// measured, stored or sent.
const ReadingContext = createContext({ seconds: 0, progress: 0 })

export const formatReading = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

export function ReadingSessionProvider({ children }) {
  const [seconds, setSeconds] = useState(0)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Counts only while the tab is visible, like a session that pauses.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setSeconds(value => value + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0)
    }
    const onScroll = () => { frame ||= requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return <ReadingContext.Provider value={{ seconds, progress }}>{children}</ReadingContext.Provider>
}

export const useReading = () => useContext(ReadingContext)

// The header's session ring: the logo's ring and core, the ring filling with
// how far down the page you are, beside the reading time.
export function ReadingBadge() {
  const { seconds, progress } = useReading()
  const length = 2 * Math.PI * 26
  return (
    <span className="site-reading" title="Your reading session on this page. Nothing is measured or stored.">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="26" className="site-reading-track" />
        <circle cx="50" cy="50" r="26" className="site-reading-arc" strokeDasharray={length} strokeDashoffset={length * (1 - progress)} />
        <circle cx="50" cy="50" r="10" className="site-reading-core" />
      </svg>
      <span className="site-reading-label">Reading</span>
      <b>{formatReading(seconds)}</b>
    </span>
  )
}

// A section label that stamps the reading time when you first reach it.
export function Stamp({ children, light = false }) {
  const ref = useRef(null)
  const seen = useSeen(ref, 1)
  const { seconds } = useReading()
  const [at, setAt] = useState(null)
  useEffect(() => {
    if (seen && at === null) setAt(seconds)
  }, [seen, at, seconds])
  return (
    <p className={`site-label site-stamp${light ? ' is-light' : ''}`} ref={ref}>
      <span className={`site-stamp-time${at === null ? '' : ' is-set'}`}>{at === null ? '--:--' : formatReading(at)}</span>
      {children}
    </p>
  )
}

export function ReadingTotal() {
  const { seconds } = useReading()
  return <b className="site-reading-total">{formatReading(seconds)}</b>
}

// The signature line: one sample session, cut into parts that run between the
// sections, so the page reads as one session from top to bottom.
const PARTS = 4

export function SessionLine({ part }) {
  const ref = useRef(null)
  const seen = useSeen(ref, 0.6)
  const { scores, intervalSeconds, startedAt } = DEMO_SESSION
  const size = Math.ceil(scores.length / PARTS)
  const from = part * size
  const slice = scores.slice(from, Math.min(scores.length, from + size + 1))
  const y = value => 4 + (1 - value / 100) * 52
  const smoothed = slice.map((_, index) => {
    const window = slice.slice(Math.max(0, index - 2), index + 3)
    return window.reduce((sum, value) => sum + value, 0) / window.length
  })
  const path = smoothed.map((value, index) => `${index ? 'L' : 'M'}${((index / (slice.length - 1)) * 1000).toFixed(1)} ${y(value).toFixed(1)}`).join('')
  const at = index => formatClock(startedAt + index * intervalSeconds * 1000)
  return (
    <div className={`site-line${seen ? ' is-drawn' : ''}`} ref={ref} aria-hidden="true">
      <svg viewBox="0 0 1000 60" preserveAspectRatio="none">
        <line className="site-line-rule" x1="0" x2="1000" y1={y(40)} y2={y(40)} />
        <path className="site-line-path" d={path} pathLength="1" />
      </svg>
      <div className="site-line-ticks">
        <span>{at(from)}</span>
        {part === 0 && <span className="site-line-note">One focus session, read as you scroll · sample data</span>}
        <span>{at(Math.min(scores.length, from + size))}</span>
      </div>
    </div>
  )
}

// Instrument corner marks around an element, like a viewfinder.
export function Brackets() {
  return (
    <span className="site-brackets" aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  )
}
