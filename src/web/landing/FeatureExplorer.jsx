import { useEffect, useRef, useState } from 'react'
import labShot from './assets/lab.webp'
import plannerShot from './assets/session-planner.webp'
import reportShot from './assets/session-report.webp'
import analyticsShot from './assets/analytics.webp'
import workspaceShot from './assets/workspace.webp'
import protectionShot from './assets/protection.webp'

// What the app does, one place at a time. It plays through on its own while
// it is on screen; hovering, focusing or choosing a tab hands control to the
// visitor. Only what the app really has; no thresholds.
const FEATURES = [
  { id: 'lab', name: 'Lab', title: 'Your day at a glance', body: 'Focus Score, session time, attention and deep focus for today, this week or this month. The next session starts from the same screen.', image: labShot, alt: 'The Lab with the day’s Focus Score, its three measures and an attention strip' },
  { id: 'sessions', name: 'Sessions', title: 'Start in seconds', body: 'Name it, pick a length, go. A recent setup starts again in one click.', image: plannerShot, alt: 'Planning a session with a name, a length and recent setups' },
  { id: 'reports', name: 'Reports', title: 'Every session, read back', body: 'Attention over time, the moments it slipped, how quickly you came back, and your longest stretch of deep focus.', image: reportShot, alt: 'A session report with an attention timeline' },
  { id: 'history', name: 'History', title: 'Records and history', body: 'Your personal records, and every session with how it went. Search it, export it, keep it.', image: analyticsShot, alt: 'Personal records and the session history' },
  { id: 'workspace', name: 'Workspace', title: 'Your desk, in 3D', body: 'Place your screens, laptop and notes, so a look at your second display counts as work.', image: workspaceShot, alt: 'A desk with two displays in the 3D workspace editor' },
  { id: 'protection', name: 'Protection', title: 'Blocking, if you want it', body: 'Keep chosen apps and sites out of reach during a session. Or block nothing at all.', image: protectionShot, alt: 'A protection setup with allowed tools and blocked sites' },
]

const STEP_MS = 6000

export default function FeatureExplorer() {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [held, setHeld] = useState(false)
  const rootRef = useRef(null)

  // Plays only while visible, and never with reduced motion.
  useEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined
    const observer = new IntersectionObserver(([entry]) => setPlaying(entry.isIntersecting), { threshold: 0.45 })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!playing || held) return undefined
    const timer = window.setTimeout(() => setActive(index => (index + 1) % FEATURES.length), STEP_MS)
    return () => window.clearTimeout(timer)
  }, [active, playing, held])

  const choose = index => {
    setActive(index)
    setHeld(true)
  }

  const running = playing && !held

  return (
    <div
      className="site-explorer site-rv"
      ref={rootRef}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHeld(false) }}
    >
      <div className="site-explorer-tabs" role="tablist" aria-label="Inside the app">
        {FEATURES.map((feature, index) => (
          <button
            key={feature.id}
            type="button"
            role="tab"
            id={`feature-tab-${feature.id}`}
            aria-selected={index === active}
            aria-controls="feature-stage"
            className={index === active ? 'is-on' : ''}
            onClick={() => choose(index)}
          >
            <span className="site-explorer-name">{feature.name}</span>
            <span className="site-explorer-title">{feature.title}</span>
            <span className="site-explorer-body"><span>{feature.body}</span></span>
            <span className="site-explorer-bar" aria-hidden="true">
              <i key={`${active}-${running}`} className={index === active && running ? 'is-running' : ''} style={{ animationDuration: `${STEP_MS}ms` }} />
            </span>
          </button>
        ))}
      </div>
      <div className="site-explorer-stage" id="feature-stage" role="tabpanel" aria-labelledby={`feature-tab-${FEATURES[active].id}`}>
        {FEATURES.map((feature, index) => (
          <img
            key={feature.id}
            src={feature.image}
            alt={index === active ? feature.alt : ''}
            aria-hidden={index !== active}
            className={index === active ? 'is-on' : ''}
            loading="lazy"
          />
        ))}
      </div>
    </div>
  )
}
