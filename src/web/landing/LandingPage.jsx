import { useEffect, useRef } from 'react'
import RequestAccessForm from '../RequestAccessForm'
import { SiteFooter, SiteHeader } from './SiteChrome'
import labShot from './assets/lab.webp'
import reportShot from './assets/session-report.webp'
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
  { id: 'day', label: 'Your day' },
  { id: 'beta', label: 'Closed beta' },
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
              <img src={reportShot} alt="A session report: 1 hour 15 minutes, average attention 83, an attention timeline with two short lapses, and a longest Deep Focus block of 21 minutes" width="1800" height="1314" loading="lazy" />
              <figcaption>Every session ends with a report: when attention held, when it slipped, and how quickly it came back.</figcaption>
            </figure>
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
      </main>

      <SiteFooter />
    </div>
  )
}
