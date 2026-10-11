import { useEffect, useRef, useState } from 'react'
import RequestAccessForm from '../RequestAccessForm'
import { SiteFooter, SiteHeader } from './SiteChrome'
import AttentionTrace from './AttentionTrace'
import FeatureExplorer from './FeatureExplorer'
import labShot from './assets/lab.webp'
import labScoreShot from './assets/lab-score.webp'
import reportShot from './assets/session-report.webp'
import plannerShot from './assets/session-planner.webp'
import weekShot from './assets/week-review.webp'
import hoursShot from './assets/best-hours.webp'
import workspaceShot from './assets/workspace.webp'
import './landing.css'

// The public landing page. Light page, dark product: the app's own screens are
// the dark surfaces, and the page itself moves through colour fields (white,
// night, ultramarine) as it goes from the product into its method and idea.
//
// Claims stay inside what the product measures (AGENTS.md §5): it observes
// presence, where you face and what is in front, never thoughts or feelings,
// and the score is the user's own daily summary, not a validated measure of
// cognition. Focus data stays on the Mac; account and access data does not, so
// never write "nothing leaves your device". The page describes what the app
// does, not its scoring thresholds.
//
// The demo day below is the one the screenshots were taken from, so every
// number on the page matches the screens.
const DEMO_DAY = {
  score: 78,
  usual: 69,
  sessionMinutes: 185,
  attention: 78,
  deepFocusMinutes: 121,
  // Ring fractions as the app draws them: focus time against the day's
  // reference, average attention / 100, Deep Focus share of measured time.
  rings: [1, 0.78, 0.66],
}

const CHAPTERS = [
  { id: 'session', label: 'Session' },
  { id: 'score', label: 'Score' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'features', label: 'Features' },
  { id: 'method', label: 'Method' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'why', label: 'Why' },
  { id: 'access', label: 'Access' },
]

function ChapterLabel({ id }) {
  return <p className="site-label">{CHAPTERS.find(item => item.id === id).label}</p>
}

const SESSION_STEPS = [
  { title: 'Name it', body: 'What you’re working on, and for how long. A recent setup starts again in one click.' },
  { title: 'Work', body: 'The camera estimates your attention on your Mac. Nothing asks you a question while a session runs.' },
  { title: 'Read it', body: 'When it ends: attention over time, lapses, how fast you came back, your longest stretch of deep focus.' },
]

const FIRST_WEEKS = [
  { when: 'Day one', title: 'Set up your desk', body: 'Tell it where your screens are, once. Then your first session and your first report.' },
  { when: 'After a few days', title: 'Your usual takes shape', body: 'Each day is compared with your own typical day, never with anyone else’s.' },
  { when: 'After a week', title: 'Your week in review', body: 'Deep focus, attention and your best day, next to the week before.' },
  { when: 'Over the weeks', title: 'Your best hours', body: 'Once there is enough data, it shows which times of day hold your attention. Until then it says nothing.' },
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

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Below-the-fold blocks start lowered and masked, then rise into place once.
function useReveal(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || prefersReducedMotion() || !('IntersectionObserver' in window)) return undefined
    const items = [...root.querySelectorAll('.site-rv')]
      .filter(el => el.getBoundingClientRect().top > window.innerHeight)
    items.forEach(el => el.classList.add('is-pre'))
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return
      entry.target.classList.remove('is-pre')
      observer.unobserve(entry.target)
    }), { rootMargin: '0px 0px -10% 0px' })
    items.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [rootRef])
}

// The chapter in view lights up in the rail, and its band's tone (light,
// night, ultra) recolours the header and rail so they never sit on the wrong
// ground.
function useChapterTone(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || !('IntersectionObserver' in window)) return undefined
    const links = [...root.querySelectorAll('.site-rail a')]
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return
      const target = entry.target
      if (target.dataset.tone) root.dataset.tone = target.dataset.tone
      const chapter = target.dataset.chapterId
      if (chapter) links.forEach(link => link.classList.toggle('is-on', link.dataset.chapter === chapter))
    }), { rootMargin: '-48% 0px -48% 0px' })
    root.querySelectorAll('.site-band, [data-chapter-id]').forEach(element => observer.observe(element))
    return () => observer.disconnect()
  }, [rootRef])
}

// The hero Mac grows gently into place as it scrolls up.
function useMacScale(macRef) {
  useEffect(() => {
    const mac = macRef.current
    if (!mac || prefersReducedMotion()) return undefined
    let frame = 0
    const update = () => {
      frame = 0
      const top = mac.getBoundingClientRect().top
      const progress = Math.max(0, Math.min(1, 1 - (top - 100) / (window.innerHeight * 0.9)))
      mac.style.transform = `scale(${0.9 + 0.1 * progress})`
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

// True once the element is well inside the viewport (at once with reduced motion).
function useSeen(ref, threshold = 0.4) {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      setSeen(true)
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setSeen(true)
      observer.disconnect()
    }, { threshold })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, threshold])
  return seen
}

// Counts from 0 to the target once `run` turns true.
function useCountUp(target, run, ms = 1400) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!run) return undefined
    if (prefersReducedMotion()) {
      setValue(target)
      return undefined
    }
    let frame = 0
    let start = 0
    const step = now => {
      start ||= now
      const t = Math.min(1, (now - start) / ms)
      setValue(Math.round(target * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, run, ms])
  return value
}

const hoursMinutes = minutes => `${Math.floor(minutes / 60)}h ${minutes % 60}m`

// Three thin nested rings, the app's Focus Score mark, in tones that read on a
// light ground. Arcs sweep in and the numbers count up together.
function DayScore() {
  const ref = useRef(null)
  const seen = useSeen(ref)
  const score = useCountUp(DEMO_DAY.score, seen)
  const attention = useCountUp(DEMO_DAY.attention, seen)
  const session = useCountUp(DEMO_DAY.sessionMinutes, seen)
  const deep = useCountUp(DEMO_DAY.deepFocusMinutes, seen)
  const radii = [58, 49, 40]
  return (
    <figure className="site-tile site-day-score site-rv" ref={ref}>
      <div className="site-rings">
        <svg className={seen ? 'is-drawn' : ''} viewBox="0 0 128 128" aria-hidden="true">
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
                  style={{ '--len': length, '--off': length * (1 - DEMO_DAY.rings[index]), transitionDelay: `${index * 140}ms` }}
                />
              </g>
            )
          })}
        </svg>
        <div className="site-rings-center">
          <b aria-label={`Focus Score ${DEMO_DAY.score}`}>{score}</b>
          <span>Focus Score</span>
        </div>
      </div>
      <dl className="site-metrics">
        <div><dt><i className="site-dot site-dot-1" />Session time</dt><dd>{hoursMinutes(session)}</dd></div>
        <div><dt><i className="site-dot site-dot-2" />Attention</dt><dd>{attention}<small>/100</small></dd></div>
        <div><dt><i className="site-dot site-dot-3" />Deep focus</dt><dd>{hoursMinutes(deep)}</dd></div>
      </dl>
      <figcaption>Thursday · usual day {DEMO_DAY.usual}</figcaption>
    </figure>
  )
}

// A product screenshot that unmasks from its centre as it scrolls in.
function Shot({ src, alt, width, height, caption }) {
  return (
    <figure className="site-tile site-tile-shot site-rv">
      <div className="site-shot-frame">
        <img src={src} alt={alt} width={width} height={height} loading="lazy" />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

export default function LandingPage({ api }) {
  const rootRef = useRef(null)
  const macRef = useRef(null)
  useReveal(rootRef)
  useChapterTone(rootRef)
  useMacScale(macRef)

  return (
    <div className="site" ref={rootRef} data-tone="light">
      <SiteHeader />

      <aside className="site-rail" aria-label="On this page">
        <nav>
          {CHAPTERS.map(chapter => (
            <a key={chapter.id} href={`#${chapter.id}`} data-chapter={chapter.id}>{chapter.label}</a>
          ))}
        </nav>
      </aside>

      <main id="top" className="site-main">
        <div className="site-band" data-tone="light">
          <section className="site-hero site-wrap">
            <p className="site-label site-label-accent">Focus sessions for Mac · Closed beta</p>
            <h1>Focus you can <em>see</em>.<br /><span className="site-dim">Day after day.</span></h1>
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
            <AttentionTrace />
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
        </div>

        <div className="site-band is-mist" data-tone="light">
          <section className="site-chapter site-wrap" id="session" data-chapter-id="session">
            <div className="site-ch-head site-rv">
              <ChapterLabel id="session" />
              <h2>Start a session. Then just <em>work</em>.</h2>
              <p>Focus only counts inside a session you start, so the numbers mean what they say. Blocking is up to you: keep out what pulls you away, or nothing at all.</p>
            </div>
            <Shot src={plannerShot} alt="Starting a session: a name, a length of one hour, and recent setups to reuse" width="2000" height="1250" />
            <ol className="site-steps site-steps-plain site-rv">
              {SESSION_STEPS.map(step => <li key={step.title}><b>{step.title}</b><span>{step.body}</span></li>)}
            </ol>
          </section>
        </div>

        <div className="site-band" data-tone="light">
          <section className="site-chapter site-wrap" id="score" data-chapter-id="score">
            <div className="site-ch-head site-rv">
              <ChapterLabel id="score" />
              <h2>One number for your <em>day</em>.</h2>
              <p>Focus time, attention and deep focus add up to one daily score, compared with your own usual day. Never with anyone else.</p>
            </div>
            <div className="site-day">
              <DayScore />
              <Shot
                src={reportShot}
                alt="A session report: 1 hour 15 minutes, average attention 83, an attention timeline with two short lapses, and a longest Deep Focus block of 21 minutes"
                width="1800"
                height="1354"
                caption="Every session ends with a report: when attention held, when it slipped, and how quickly it came back."
              />
            </div>
          </section>
        </div>

        <div className="site-band is-sage" data-tone="light">
          <section className="site-chapter site-wrap" id="patterns" data-chapter-id="patterns">
            <div className="site-ch-head site-rv">
              <ChapterLabel id="patterns" />
              <h2>The longer you use it, the more it can <em>tell</em> you.</h2>
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
              <Shot src={weekShot} alt="Week in review: 7 hours 34 minutes of Deep Focus, 37 minutes more than the week before, average attention 74, best day Monday" width="1800" height="324" caption="Every week, next to the one before." />
              <Shot src={hoursShot} alt="Time of day: late morning records 17 points higher average attention than the afternoon" width="1800" height="652" caption="When the difference is real, it names your best hours." />
            </div>
          </section>
        </div>

        <div className="site-band is-night" data-tone="night">
          <section className="site-chapter site-wrap" id="features" data-chapter-id="features">
            <div className="site-ch-head site-rv">
              <ChapterLabel id="features" />
              <h2>Everything in the <em>app</em>.</h2>
              <p>Six places, one job: making your focus visible.</p>
            </div>
            <FeatureExplorer />
          </section>

          <section className="site-chapter site-wrap" id="method" data-chapter-id="method">
            <div className="site-ch-head site-rv">
              <ChapterLabel id="method" />
              <h2>What it watches, and what it <em>doesn’t</em>.</h2>
              <p>Eudaimonai observes behaviour, not thoughts. It knows where your screens and desk are, so a look at your second display isn’t counted as looking away.</p>
            </div>
            <Shot src={workspaceShot} alt="The workspace editor: a desk with two displays, a keyboard and the tracking camera in 3D" width="2000" height="1250" />
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

          <section className="site-chapter site-wrap" id="privacy" data-chapter-id="privacy">
            <div className="site-ch-head site-rv">
              <ChapterLabel id="privacy" />
              <h2>Your focus data stays on your <em>Mac</em>.</h2>
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
        </div>

        <div className="site-band is-ultra" data-tone="ultra">
          <section className="site-chapter site-wrap site-why" id="why" data-chapter-id="why">
            <ChapterLabel id="why" />
            <h2 className="site-rv">Everything worth doing takes <em>deep focus</em>.</h2>
            <div className="site-why-body site-rv">
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
            <div className="site-wont site-rv">
              <p className="site-label">What we won’t build</p>
              <ul>{WONT_BUILD.map(item => <li key={item}>{item}</li>)}</ul>
            </div>
          </section>
        </div>

        <div className="site-band is-dawn" data-tone="light">
          <section className="site-chapter site-wrap" id="access" data-chapter-id="access">
            <div className="site-ch-head site-rv">
              <ChapterLabel id="access" />
              <h2>20 places to <em>start</em>.</h2>
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
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
