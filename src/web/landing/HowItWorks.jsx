import { useEffect, useRef, useState } from 'react'
import { DEMO_DAY, DEMO_SESSION } from './demoData'
import { prefersReducedMotion, useOnScreen, useProgress } from './motion'
import { Brackets } from './ReadingSession'

// How it works, as five scenes on one stage. Each scene is drawn in the app's
// own look (night ground, silver ring, green for attention) and moves only
// while it is on screen. Everything shown is something the app does; nothing claims more.

// Runs `tick` every `ms` while `on`; a stand-in for setInterval tied to view.
function useTicker(on, ms, tick) {
  const saved = useRef(tick)
  useEffect(() => { saved.current = tick })
  useEffect(() => {
    if (!on || prefersReducedMotion()) return undefined
    const timer = window.setInterval(() => saved.current(), ms)
    return () => window.clearInterval(timer)
  }, [on, ms])
}

function PlanScene({ run }) {
  const typed = useProgress(run, 1600, 200)
  const name = 'Investor update draft'
  const chosen = typed >= 1
  return (
    <div className="site-scene is-plan" aria-hidden="true">
      <span className="site-scene-label">Session name</span>
      <div className="site-plan-field">{name.slice(0, Math.round(name.length * typed))}<i className="site-caret" /></div>
      <span className="site-scene-label">Length</span>
      <div className="site-plan-chips">
        {['30m', '1h', '1h 30m', 'No limit'].map(length => (
          <span key={length} className={chosen && length === '1h' ? 'is-on' : ''}>{length}</span>
        ))}
      </div>
      <span className="site-scene-label">Keep out during this session</span>
      <div className="site-plan-chips is-block">
        {['YouTube', 'Instagram', 'TikTok'].map((site, index) => (
          <span key={site} className={chosen ? 'is-on' : ''} style={{ transitionDelay: `${0.25 + index * 0.15}s` }}><i />{site}</span>
        ))}
      </div>
      <div className={`site-plan-start${chosen ? ' is-ready' : ''}`}>Start focus session<b>1h</b></div>
    </div>
  )
}

function SessionScene({ on }) {
  const total = 60 * 60
  const [left, setLeft] = useState(42 * 60 + 17)
  useTicker(on, 1000, () => setLeft(value => (value > 1 ? value - 1 : total)))
  const elapsed = 1 - left / total
  const r1 = 92
  const r2 = 76
  const c1 = 2 * Math.PI * r1
  const c2 = 2 * Math.PI * r2
  return (
    <div className="site-scene is-session" aria-hidden="true">
      <span className="site-session-task">Investor update draft</span>
      <div className="site-session-ring">
        <svg viewBox="0 0 200 200">
          <circle cx="100" cy="100" r={r1} className="site-session-track" />
          <circle cx="100" cy="100" r={r1} className="site-session-elapsed" strokeDasharray={c1} strokeDashoffset={c1 * (1 - elapsed)} />
          <circle cx="100" cy="100" r={r2} className="site-session-track" />
          <circle cx="100" cy="100" r={r2} className="site-session-attention" strokeDasharray={c2} strokeDashoffset={c2 * 0.14} />
        </svg>
        <div className="site-session-time">
          <b>{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</b>
          <span>Deep focus</span>
        </div>
      </div>
      <div className="site-session-bar">
        <span><i className="is-sound" />Rain</span>
        <span>Session plan</span>
        <span>End session</span>
      </div>
    </div>
  )
}

// A top view of the desk with its focus zones. The gaze moves between things
// on the desk; inside a zone reads as focused, outside as away.
const TARGETS = [
  { id: 'main', label: 'Main screen', x: 150, y: 52, inZone: true },
  { id: 'notes', label: 'Your notes', x: 92, y: 132, inZone: true },
  { id: 'side', label: 'Second screen', x: 246, y: 74, inZone: true },
  { id: 'phone', label: 'Phone', x: 54, y: 176, inZone: false },
  { id: 'window', label: 'Window', x: 284, y: 182, inZone: false },
]

function ZonesScene({ on }) {
  const [step, setStep] = useState(0)
  useTicker(on, 1700, () => setStep(value => (value + 1) % TARGETS.length))
  const target = TARGETS[step]
  const head = { x: 160, y: 196 }
  const angle = Math.atan2(target.y - head.y, target.x - head.x)
  const length = Math.hypot(target.x - head.x, target.y - head.y) - 14
  const spread = 0.2
  const tip = a => `${(head.x + Math.cos(a) * length).toFixed(1)},${(head.y + Math.sin(a) * length).toFixed(1)}`
  return (
    <div className="site-scene is-zones" aria-hidden="true">
      <svg viewBox="0 0 320 240">
        <rect className="site-zone-desk" x="20" y="22" width="280" height="150" rx="14" />
        <path className="site-zone" d="M160 196 L104 44 L196 44 Z" />
        <path className="site-zone" d="M160 196 L224 52 L272 84 Z" />
        <path className="site-zone" d="M160 196 L66 122 L118 144 Z" />
        <rect className="site-zone-object" x="110" y="40" width="80" height="10" rx="3" />
        <rect className="site-zone-object" x="222" y="62" width="52" height="9" rx="3" transform="rotate(32 248 66)" />
        <rect className="site-zone-object is-paper" x="70" y="118" width="40" height="30" rx="3" transform="rotate(-18 90 133)" />
        <rect className="site-zone-object is-phone" x="44" y="164" width="18" height="28" rx="4" />
        <polygon className={`site-zone-gaze${target.inZone ? '' : ' is-away'}`} points={`${head.x},${head.y} ${tip(angle - spread)} ${tip(angle + spread)}`} />
        <circle className="site-zone-head" cx={head.x} cy={head.y} r="15" />
        <circle className="site-zone-camera" cx="150" cy="34" r="4" />
      </svg>
      <div className={`site-zone-status${target.inZone ? '' : ' is-away'}`}>
        <span>{target.label}</span>
        <b>{target.inZone ? 'Focused' : 'Looking away'}</b>
      </div>
    </div>
  )
}

function ScoreScene({ run }) {
  const progress = useProgress(run, 3800, 200)
  const { scores } = DEMO_SESSION
  const count = scores.length
  const shown = Math.max(2, Math.round(progress * count))
  const y = value => 6 + (1 - value / 100) * 88
  const points = scores.slice(0, shown).map((value, index) => `${(index / (count - 1)) * 100},${y(value).toFixed(2)}`).join(' ')
  const score = Math.round(DEMO_DAY.score * Math.max(0, (progress - 0.55) / 0.45))
  return (
    <div className="site-scene is-score" aria-hidden="true">
      <div className="site-score-line">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <rect className="site-score-band" x="0" y={y(100)} width="100" height={y(72) - y(100)} />
          <line className="site-score-rule" x1="0" x2="100" y1={y(40)} y2={y(40)} />
          <polyline className="site-score-trace" points={points} />
        </svg>
        <div className="site-score-keys"><span className="is-deep">Deep focus</span><span className="is-lapse">Lapse</span></div>
      </div>
      <div className="site-score-total">
        <b>{score || '—'}</b>
        <span>Focus Score today</span>
        <small>Your usual: {DEMO_DAY.usual}</small>
      </div>
    </div>
  )
}

function SoundScene({ on }) {
  const [mode, setMode] = useState(0)
  useTicker(on, 2600, () => setMode(value => (value + 1) % 3))
  const modes = ['Rain', 'White noise', 'Brown noise']
  return (
    <div className={`site-scene is-sound${on ? ' is-live' : ''}`} aria-hidden="true">
      <div className="site-sound-modes">
        {modes.map((label, index) => <span key={label} className={index === mode ? 'is-on' : ''}>{label}</span>)}
      </div>
      <div className="site-sound-wave">
        {Array.from({ length: 32 }, (_, index) => <i key={index} style={{ animationDelay: `${(index % 8) * -0.17 - mode * 0.3}s`, '--h': `${30 + ((index * 37) % 60)}%` }} />)}
      </div>
      <div className="site-sound-bells">
        <span><i className="is-note" /><i className="is-note is-up" />A soft bell at the start</span>
        <span><i className="is-note is-up" /><i className="is-note" />and at the end</span>
        <span><i className="is-remind" />A gentle reminder if you drift</span>
      </div>
    </div>
  )
}

export const SCENES = [
  { id: 'plan', title: 'Plan the session', body: 'Name what you’re working on and pick a length. Choose what to keep out, or block nothing at all. A recent setup starts again in one click.', Scene: PlanScene },
  { id: 'work', title: 'Work on your task', body: 'The session runs with its timer in view. Nothing asks you a question while you work; you only focus on the task in front of you.', Scene: SessionScene },
  { id: 'zones', title: 'The camera reads your focus', body: 'You set up your desk once: screens, notes, laptop. During a session the camera on your Mac reads where your eyes and head are pointed. Inside a focus zone counts as focus; your phone or the window does not.', Scene: ZonesScene },
  { id: 'score', title: 'Your score builds itself', body: 'Every moment becomes attention. Long, steady stretches count as deep focus; drifting off counts as a lapse. Your day adds up to one Focus Score, measured against your own usual.', Scene: ScoreScene },
  { id: 'sound', title: 'Sound that keeps you in it', body: 'Optional rain, white or brown noise while you work. A soft two-note bell marks the start and the end, and a gentle reminder brings you back if you drift for too long.', Scene: SoundScene },
]

const SHORT = ['Plan', 'Work', 'Camera', 'Score', 'Sound']
const STEP_MS = 5200

// One stage, the steps playing through like stories while it is on screen.
// Choosing a step takes over; every scene stays mounted and the active one is
// remounted so its animation replays. With reduced motion nothing advances.
export default function HowItWorks() {
  const ref = useRef(null)
  const on = useOnScreen(ref, 0.3)
  const [active, setActive] = useState(0)
  const [cycle, setCycle] = useState(0)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!on || held) return undefined
    const timer = window.setTimeout(() => {
      setActive(value => (value + 1) % SCENES.length)
      setCycle(value => value + 1)
    }, STEP_MS)
    return () => window.clearTimeout(timer)
  }, [on, held, active])

  const choose = index => {
    setActive(index)
    setCycle(value => value + 1)
    setHeld(true)
  }
  const running = on && !held
  const scene = SCENES[active]

  return (
    <div className="site-story" ref={ref}>
      <div className="site-story-copy">
        <div className="site-story-text" key={active} id="how-step" role="tabpanel" aria-labelledby={`how-tab-${scene.id}`}>
          <span className="site-how-number">{String(active + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')}</span>
          <h3>{scene.title}</h3>
          <p>{scene.body}</p>
        </div>
        <div className="site-story-steps" role="tablist" aria-label="Steps of a session">
          {SCENES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`how-tab-${item.id}`}
              aria-selected={index === active}
              aria-controls="how-step"
              className={index === active ? 'is-on' : index < active ? 'is-done' : ''}
              onClick={() => choose(index)}
            >
              <span className="site-story-bar" aria-hidden="true">
                <i key={`${active}-${running}`} className={index === active && running ? 'is-running' : ''} style={{ animationDuration: `${STEP_MS}ms` }} />
              </span>
              {SHORT[index]}
            </button>
          ))}
        </div>
      </div>
      <div className="site-story-stage site-framed" aria-hidden="true">
        <Brackets />
        {SCENES.map((item, index) => {
          const { Scene } = item
          const isOn = index === active
          return (
            <div key={item.id} className={`site-story-layer${isOn ? ' is-on' : ''}`}>
              <Scene key={isOn ? `on-${cycle}` : 'off'} run={isOn && on} on={isOn && on} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
