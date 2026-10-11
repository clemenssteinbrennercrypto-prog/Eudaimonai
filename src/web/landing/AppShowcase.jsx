import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion, useOnScreen } from './motion'
import labShot from './assets/lab.webp'
import plannerShot from './assets/session-planner.webp'
import reportShot from './assets/mac-report.webp'
import weekShot from './assets/mac-week.webp'
import historyShot from './assets/analytics.webp'
import analyticsShot from './assets/mac-analytics.webp'
import bestHoursShot from './assets/mac-best-hours.webp'
import workspaceShot from './assets/workspace.webp'
import protectionShot from './assets/mac-protection.webp'

// The app itself: a Mac that grows into place as it scrolls up, showing one
// part of the app at a time. It moves on by itself while on screen; choosing a
// part hands control to the visitor. Only what the app really has.
const PARTS = [
  { id: 'lab', name: 'Lab', body: 'Your day at a glance: Focus Score, time in sessions, attention and deep focus, for today, this week or this month. The next session starts right here.', image: labShot },
  { id: 'sessions', name: 'Sessions', body: 'Name what you’re working on, pick a length, and choose what to block, if anything. A recent setup starts again in one click.', image: plannerShot },
  { id: 'reports', name: 'Reports', body: 'Every session, read back: attention over time, the moments it slipped, how quickly you came back, and your longest stretch of deep focus.', image: reportShot },
  { id: 'week', name: 'Weekly review', body: 'Each week against the one before: deep focus, attention, lapses, your best day and the records you set.', image: weekShot },
  { id: 'analytics', name: 'Analytics', body: 'Every session on one line over the weeks: is your attention rising, and how does this month compare with the last?', image: analyticsShot },
  { id: 'hours', name: 'Best hours', body: 'Which time of day holds your attention best, on a 24-hour dial. It only names a pattern once there is enough data to back it.', image: bestHoursShot },
  { id: 'history', name: 'History', body: 'Personal records and every session, with how it went. Search it, export it as CSV or JSON, or delete what you don’t want to keep.', image: historyShot },
  { id: 'workspace', name: 'Workspace', body: 'Your desk in 3D: screens, laptop, notes. A look at your second display counts as work, not as looking away.', image: workspaceShot },
  { id: 'protection', name: 'Protection', body: 'Optional, per session: keep chosen apps and sites out of reach, and the tools you need within it.', image: protectionShot },
]

const STEP_MS = 5000

// The Mac scales from 86% to full size as it rises through the viewport.
function useMacScale(macRef) {
  useEffect(() => {
    const mac = macRef.current
    if (!mac || prefersReducedMotion()) return undefined
    let frame = 0
    const update = () => {
      frame = 0
      const top = mac.getBoundingClientRect().top
      const progress = Math.max(0, Math.min(1, 1 - (top - 80) / (window.innerHeight * 0.85)))
      mac.style.transform = `scale(${0.86 + 0.14 * progress})`
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
  }, [macRef])
}

export default function AppShowcase() {
  const macRef = useRef(null)
  const rootRef = useRef(null)
  const onScreen = useOnScreen(rootRef, 0.35)
  const [active, setActive] = useState(0)
  const [held, setHeld] = useState(false)
  useMacScale(macRef)

  useEffect(() => {
    if (!onScreen || held) return undefined
    const timer = window.setTimeout(() => setActive(index => (index + 1) % PARTS.length), STEP_MS)
    return () => window.clearTimeout(timer)
  }, [active, onScreen, held])

  const running = onScreen && !held
  const part = PARTS[active]

  return (
    <div className="site-showcase" ref={rootRef}>
      <div className="site-mac" ref={macRef}>
        <div className="site-mac-lid">
          <div className="site-mac-screen" id="app-screen" role="tabpanel" aria-labelledby={`app-tab-${part.id}`}>
            {PARTS.map((item, index) => (
              <img
                key={item.id}
                src={item.image}
                alt={index === active ? `Eudaimonai, ${item.name}` : ''}
                aria-hidden={index !== active}
                className={index === active ? 'is-on' : ''}
                width="2000"
                height="1250"
                loading={index === 0 ? 'eager' : 'lazy'}
              />
            ))}
          </div>
        </div>
        <div className="site-mac-base" />
      </div>

      <div className="site-showcase-tabs" role="tablist" aria-label="Parts of the app">
        {PARTS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`app-tab-${item.id}`}
            aria-selected={index === active}
            aria-controls="app-screen"
            className={index === active ? 'is-on' : ''}
            onClick={() => { setActive(index); setHeld(true) }}
          >
            {item.name}
            <span className="site-showcase-bar" aria-hidden="true">
              <i key={`${active}-${running}`} className={index === active && running ? 'is-running' : ''} style={{ animationDuration: `${STEP_MS}ms` }} />
            </span>
          </button>
        ))}
      </div>
      <p className="site-showcase-text" aria-live="polite">{part.body}</p>
      <p className="site-showcase-also">Also in the menu bar, one click away. Everything stays on your Mac.</p>
    </div>
  )
}
