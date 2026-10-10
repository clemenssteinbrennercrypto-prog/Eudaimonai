import { useEffect, useRef } from 'react'
import RequestAccessForm from '../RequestAccessForm'
import { SiteFooter, SiteHeader } from './SiteChrome'
import labShot from './assets/lab.webp'
import labScoreShot from './assets/lab-score.webp'
import reportShot from './assets/session-report.webp'
import plannerShot from './assets/session-planner.webp'
import weekShot from './assets/week-review.webp'
import hoursShot from './assets/best-hours.webp'
import workspaceShot from './assets/workspace.webp'
import './landing.css'

// The public landing page. Light page, dark product: the app's own screens are
// the only dark surfaces, so the eye lands on them.
//
// Claims stay inside what the product measures (AGENTS.md §5): it observes
// presence, where you face and what is in front, never thoughts or feelings,
// and the score is the user's own daily summary, not a validated measure of
// cognition. Focus data stays on the Mac; account and access data does not, so
// never write "nothing leaves your device".
//
// The demo day below is the one the screenshots were taken from, so every
// number on the page matches the screens.
const DEMO_DAY = {
  score: 78,
  usual: 69,
  sessionTime: '3h 5m',
  attention: 78,
  deepFocus: '2h 1m',
  // Ring fractions as the app draws them: focus time against the day's
  // reference, average attention / 100, Deep Focus share of measured time.
  rings: [1, 0.78, 0.66],
}

const CHAPTERS = [
  { id: 'session', label: 'Session' },
  { id: 'day', label: 'Your day' },
  { id: 'week', label: 'First weeks' },
  { id: 'method', label: 'Method' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'why', label: 'Why' },
  { id: 'beta', label: 'Closed beta' },
]

const SESSION_STEPS = [
  { title: 'Name it', body: 'What you’re working on, and for how long. A recent setup starts again in one click.' },
  { title: 'Work', body: 'The camera estimates your attention on your Mac. Nothing asks you a question while a session runs.' },
  { title: 'Read it', body: 'When it ends: attention over time, lapses, how fast you came back, your longest stretch of deep focus.' },
]

// Each step is gated by a real threshold: BASELINE_MIN_DAYS (personalBaseline.js),
// the weekly review (weeklyReview.js), MIN_SESSIONS and MIN_MEANINGFUL_GAP_PCT
// (calibration.js). Change the copy if one of them changes.
const FIRST_WEEKS = [
  { when: 'Day 1', title: 'Set up your desk', body: 'Tell it where your screens are, once. Then your first session and your first report.' },
  { when: 'Day 5', title: 'Your usual takes shape', body: 'After five days with sessions, each day is compared with your own typical day.' },
  { when: 'Week 1', title: 'Your week in review', body: 'Deep focus, attention, lapses and your best day, next to the week before.' },
  { when: 'Week 2+', title: 'Your best hours', body: 'From eight sessions on, it shows which times of day hold your attention, and only when the gap is real. Until then it says nothing.' },
]

const OBSERVES = [
  'Whether you are at your desk',
  'Where you are facing: a screen, your notes, or away',
  'Eyes closed for longer than a blink',
  'Which app or website is in front',
]

const NEVER = [
  'Record or upload video',
  'Recognise who you are',
  'Read your keystrokes or the contents of your files',
  'Guess your mood or emotions',
]

const WONT_BUILD = [
  'Monitoring for employers. It is yours, not your manager’s.',
  'Selling or uploading your focus data.',
  'A score that bends to your mood. Same ruler, every day.',
  'Insights guessed from too little data.',
]

// Only answers the product and the beta backend actually support.
const FAQ = [
  { q: 'Does the camera record video?', a: 'No. Frames are analysed in memory on your Mac and discarded. Only measurements such as where you were facing are kept, and they stay on your Mac.' },
  { q: 'What data leaves my Mac?', a: 'Your email address, your invitation and your beta access, which sign you in. The app also checks that access and looks for updates. Your sessions, history and anything from the camera stay on your Mac.' },
  { q: 'Why is access limited?', a: 'We read every request and open the beta in small groups, so we can talk to the first people using it and fix what they find.' },
  { q: 'Which Macs are supported?', a: 'Apple Silicon Macs (M1 or newer) with macOS 11 or later and a camera. The built-in one works. Intel Macs are not supported.' },
  { q: 'Is it free?', a: 'Yes, during the closed beta. No credit card.' },
  { q: 'What happens when the beta ends?', a: 'Beta access runs for 30 days from activation. When access ends, your history stays on your Mac and stays readable. Starting new sessions needs access again.' },
  { q: 'Do I have to block websites?', a: 'No. Blocking is an optional rule set per session. Measuring your focus works without it.' },
]

function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || !('IntersectionObserver' in window)) return undefined
    // Visible at rest; only what starts below the fold settles in, once.
    const items = [...root.querySelectorAll('.site-rv')]
      .filter(el => el.getBoundingClientRect().top > window.innerHeight)
    items.forEach(el => el.classList.add('is-pre'))
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return
      entry.target.classList.remove('is-pre')
      observer.unobserve(entry.target)
    }), { rootMargin: '0px 0px -8% 0px' })
    items.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [rootRef])
}

function useActiveChapter(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || !('IntersectionObserver' in window)) return undefined
    const links = [...root.querySelectorAll('.site-rail a')]
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return
      links.forEach(link => link.classList.toggle('is-on', link.dataset.chapter === entry.target.id))
    }), { rootMargin: '-45% 0px -50% 0px' })
    root.querySelectorAll('.site-chapter').forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [rootRef])
}

// The hero Mac grows gently into place as it scrolls up.
function useMacScale(macRef) {
  useEffect(() => {
    const mac = macRef.current
    if (!mac || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    let frame = 0
    const update = () => {
      frame = 0
      const top = mac.getBoundingClientRect().top
      const progress = Math.max(0, Math.min(1, 1 - (top - 100) / (window.innerHeight * 0.9)))
      mac.style.transform = `scale(${0.92 + 0.08 * progress})`
    }
    const onScroll = () => { frame ||= requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [macRef])
}

// Three thin nested rings, the app's Focus Score mark, in tones that read on a
// light ground. Arcs sweep in once when the tile scrolls into view.
function ScoreRings({ score, rings }) {
  const ref = useRef(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return undefined
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || !('IntersectionObserver' in window)) {
      svg.classList.add('is-drawn')
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      svg.classList.add('is-drawn')
      observer.disconnect()
    }, { threshold: 0.4 })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  const radii = [58, 49, 40]
  return (
    <div className="site-rings">
      <svg ref={ref} viewBox="0 0 128 128" aria-hidden="true">
        {radii.map((r, index) => {
          const length = 2 * Math.PI * r
          return (
            <g key={r} className={`site-ring site-ring-${index + 1}`}>
              <circle className="site-ring-track" cx="64" cy="64" r={r} />
              <circle
                className="site-ring-arc"
                cx="64"
                cy="64"
                r={r}
                style={{ '--len': length, '--off': length * (1 - rings[index]), transitionDelay: `${index * 120}ms` }}
              />
            </g>
          )
        })}
      </svg>
      <div className="site-rings-center">
        <b>{score}</b>
        <span>of 100</span>
      </div>
    </div>
  )
}

export default function LandingPage({ api }) {
  const rootRef = useRef(null)
  const macRef = useRef(null)
  useReveal(rootRef)
  useActiveChapter(rootRef)
  useMacScale(macRef)

  return (
    <div className="site" ref={rootRef}>
      <SiteHeader />

      <aside className="site-rail" aria-label="On this page">
        <nav>
          {CHAPTERS.map(chapter => (
            <a key={chapter.id} href={`#${chapter.id}`} data-chapter={chapter.id}>{chapter.label}</a>
          ))}
        </nav>
      </aside>

      <main id="top" className="site-main">
        <section className="site-hero site-wrap">
          <p className="site-label site-label-accent">Focus sessions for Mac · Closed beta</p>
          <h1>Focus you can see.<br /><span className="site-dim">Day after day.</span></h1>
          <p className="site-hero-sub">
            A Mac app that measures your attention during focus sessions (focus time, attention, deep focus)
            and sums up your day in one number. Your focus data stays on your Mac.
          </p>
          <div className="site-hero-form">
            <RequestAccessForm api={api} privacyHref="/privacy" />
          </div>
          <p className="site-fine">
            Free during the beta · Apple Silicon, macOS 11 or later ·{' '}
            Already invited? <a href="/activate">Activate your access</a>
          </p>
          <div className="site-mac" ref={macRef}>
            <div className="site-mac-lid">
              <img src={labShot} alt="The Eudaimonai Lab: a Focus Score of 78 with session time, average attention and Deep Focus for the day" width="2400" height="1500" />
            </div>
            <div className="site-mac-base" />
          </div>
          {/* A phone cannot read the whole window, so it gets the score panel alone. */}
          <img className="site-hero-phone-shot" src={labScoreShot} alt="" width="1400" height="417" />
          <div className="site-definition">
            <p className="site-definition-head">
              <span className="site-definition-word" lang="grc">εὐδαιμονία</span>
              <span className="site-definition-meta">eudaimonia · /ˌjuːdɪˈmoʊniə/ · noun, Ancient Greek</span>
            </p>
            <p className="site-definition-etym">
              From <i lang="grc">eu</i>, “good,” and <i lang="grc">daimōn</i>, “spirit.”
            </p>
            <p className="site-definition-body">
              In Aristotle’s ethics, the highest human good. Not a feeling but an activity: the soul at work in
              accordance with excellence, sustained over a complete life.
            </p>
            <blockquote className="site-definition-quote">
              <p>“For one swallow does not make a summer, nor does one day; and so too one day, or a short time,
                does not make a man blessed and happy.”</p>
            </blockquote>
            <p className="site-definition-source">Aristotle, <cite>Nicomachean Ethics</cite> I.7 · tr. W. D. Ross</p>
          </div>
        </section>

        <section className="site-chapter site-wrap" id="session">
          <div className="site-ch-head site-rv">
            <p className="site-label">Session</p>
            <h2>Start a session. Then just work.</h2>
            <p>Focus only counts inside a session you start, so the numbers mean what they say. Blocking is up to you: keep out what pulls you away, or nothing at all.</p>
          </div>
          <figure className="site-tile site-tile-shot site-rv">
            <img src={plannerShot} alt="Starting a session: a name, a length of one hour, and recent setups to reuse" width="2000" height="1250" loading="lazy" />
          </figure>
          <ol className="site-steps site-steps-plain site-rv">
            {SESSION_STEPS.map(step => <li key={step.title}><b>{step.title}</b><span>{step.body}</span></li>)}
          </ol>
        </section>

        <section className="site-chapter site-wrap" id="day">
          <div className="site-ch-head site-rv">
            <p className="site-label">Your day</p>
            <h2>One number for your day.</h2>
            <p>Focus time, attention and deep focus add up to one daily score, compared with your own usual day. Never with anyone else.</p>
          </div>
          <div className="site-day">
            <figure className="site-tile site-rv">
              <ScoreRings score={DEMO_DAY.score} rings={DEMO_DAY.rings} />
              <dl className="site-metrics">
                <div><dt><i className="site-dot site-dot-1" />Session time</dt><dd>{DEMO_DAY.sessionTime}</dd></div>
                <div><dt><i className="site-dot site-dot-2" />Attention</dt><dd>{DEMO_DAY.attention}<small>/100</small></dd></div>
                <div><dt><i className="site-dot site-dot-3" />Deep focus</dt><dd>{DEMO_DAY.deepFocus}</dd></div>
              </dl>
              <figcaption>Thursday · usual day {DEMO_DAY.usual}</figcaption>
            </figure>
            <figure className="site-tile site-tile-shot site-rv">
              <img src={reportShot} alt="A session report: 1 hour 15 minutes, average attention 83, an attention timeline with two short lapses, and a longest Deep Focus block of 21 minutes" width="1800" height="1354" loading="lazy" />
              <figcaption>Every session ends with a report: when attention held, when it slipped, and how quickly it came back.</figcaption>
            </figure>
          </div>
        </section>

        <section className="site-chapter site-wrap" id="week">
          <div className="site-ch-head site-rv">
            <p className="site-label">First weeks</p>
            <h2>The longer you use it, the more it can tell you.</h2>
            <p>And it stays quiet until it has enough to say something true.</p>
          </div>
          <ol className="site-timeline site-rv">
            {FIRST_WEEKS.map(step => (
              <li key={step.when}>
                <span className="site-timeline-when">{step.when}</span>
                <b>{step.title}</b>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
          <div className="site-week-shots">
            <figure className="site-tile site-tile-shot site-rv">
              <img src={weekShot} alt="Week in review: 7 hours 34 minutes of Deep Focus, 37 minutes more than the week before, average attention 74, best day Monday" width="1800" height="324" loading="lazy" />
              <figcaption>Every week, next to the one before.</figcaption>
            </figure>
            <figure className="site-tile site-tile-shot site-rv">
              <img src={hoursShot} alt="Time of day: late morning records 17 points higher average attention than the afternoon" width="1800" height="652" loading="lazy" />
              <figcaption>When the difference is real, it names your best hours.</figcaption>
            </figure>
          </div>
        </section>

        <section className="site-chapter site-wrap" id="method">
          <div className="site-ch-head site-rv">
            <p className="site-label">Method</p>
            <h2>What it watches, and what it doesn’t.</h2>
            <p>Eudaimonai observes behaviour, not thoughts. It knows where your screens and desk are, so a look at your second display isn’t counted as looking away.</p>
          </div>
          <figure className="site-tile site-tile-shot site-rv">
            <img src={workspaceShot} alt="The workspace editor: a desk with two displays, a keyboard and the tracking camera in 3D" width="2000" height="1250" loading="lazy" />
          </figure>
          <div className="site-two site-rv">
            <div>
              <h3>It observes</h3>
              <ul>{OBSERVES.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <h3>It never</h3>
              <ul className="is-never">{NEVER.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
          <p className="site-note site-rv">
            The attention score is a consistent measurement of what the camera observes, the same way every day. It is not a medical or psychological test of concentration.
          </p>
        </section>

        <section className="site-chapter site-wrap" id="privacy">
          <div className="site-ch-head site-rv">
            <p className="site-label">Privacy</p>
            <h2>Your focus data stays on your Mac.</h2>
          </div>
          <div className="site-priv site-rv">
            <div><b>Camera</b><span>Frames are analysed in memory and discarded. No video is recorded or uploaded.</span></div>
            <div><b>Your history</b><span>Sessions, scores and activity live in a local database on your Mac. Delete them whenever you like. They stay readable even after your beta access ends.</span></div>
            <div><b>Your account</b><span>Our server knows your email address, your invitation and your access. Nothing about your sessions. Stored in Frankfurt.</span></div>
          </div>
          <p className="site-perm site-rv">
            <b>What it asks for:</b> your camera, to measure attention during a session. Only if you use blocking: browser access, to see which site is in front, and your admin password once, to install the small helper that blocks the sites you list.{' '}
            <a href="/privacy">Privacy policy</a>
          </p>
        </section>

        <section className="site-chapter site-wrap" id="why">
          <div className="site-why site-rv">
            <p className="site-label">Why</p>
            <h2>Everything worth doing takes deep focus.</h2>
            <div className="site-why-body">
              <p>
                A company, a thesis, a piece of music, a hard problem in code. Whatever the field, the work that matters
                gets done in long, unbroken stretches of attention, repeated day after day. The ability to stay with
                something deeply, and for long, is what turns effort into results.
              </p>
              <p>
                It is also the hardest thing to see. Sleep has a score. Training has a load. Focus only has a feeling.
                Eudaimonai makes it visible, so you can protect it and build on it.
              </p>
            </div>
            <div className="site-wont">
              <p className="site-label">What we won’t build</p>
              <ul>{WONT_BUILD.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="site-chapter site-wrap" id="beta">
          <div className="site-ch-head site-rv">
            <p className="site-label">Closed beta</p>
            <h2>20 places to start.</h2>
            <p>
              We open Eudaimonai to a small first group and read every request ourselves. It is built for work that
              needs long stretches of attention: founders, engineers, researchers, writers.
            </p>
          </div>
          <div className="site-tile site-rv">
            <ol className="site-steps">
              <li><b>Request access</b><span>Leave your email address. Joining the list doesn’t create an account.</span></li>
              <li><b>Get your invitation</b><span>Activate it with a one-time code. There is no password.</span></li>
              <li><b>Download and sign in</b><span>Sign in to the app with the same email address and a new code.</span></li>
            </ol>
            <div className="site-beta-form">
              <RequestAccessForm api={api} privacyHref="/privacy" />
              <p className="site-fine">Already invited? <a href="/activate">Activate your access</a></p>
            </div>
          </div>
        </section>
        <section className="site-faq site-wrap" aria-labelledby="faq-title">
          <h2 id="faq-title" className="site-label">Questions</h2>
          <div className="site-qa">
            {FAQ.map(item => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
