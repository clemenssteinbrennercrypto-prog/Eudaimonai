import { useRef } from 'react'
import RequestAccessForm from '../RequestAccessForm'
import { SiteFooter, SiteHeader } from './SiteChrome'
import LogoMark from './LogoMark'
import SpecBand from './SpecBand'
import AppShowcase from './AppShowcase'
import HowItWorks from './HowItWorks'
import WhySection from './WhySection'
import PrivacyMap from './PrivacyMap'
import { useReveal, useSeen } from './motion'
import './landing.css'

// The public landing page, with a category leader's posture: one sentence,
// the product on silver, then hard facts. Light silver ground with strong dark
// accents (the spec band, the scenes, why on ultramarine, the closing band).
//   Hero        the claim, the request form, and the Mac touring the app
//   Specs       four true numbers on black
//   How         five scenes: plan, work, the camera's focus zones, the score, sound
//   Why         the thesis, on ultramarine
//   Privacy     what the camera does with a frame, and where each kind of data lives
//   Access      on black: the four steps, the form again; then the questions
//
// Claims stay inside what the product measures (AGENTS.md §5): it observes
// behaviour, not thoughts, and the score is the user's own daily summary, not
// a validated measure of cognition. Focus data stays on the Mac; account and
// access data does not, so never write "nothing leaves your device". The page
// describes what the app does, not its scoring thresholds.

const ACCESS_STEPS = [
  { title: 'Request access', body: 'Leave your email. Joining the list doesn’t create an account.' },
  { title: 'Get invited', body: 'We read every request and invite in small groups.' },
  { title: 'Activate', body: 'Open the link in your invitation and confirm with a one-time code.' },
  { title: 'Download and sign in', body: 'Install the app and sign in with the same email.' },
]

// Only answers the product and the beta backend actually support.
const FAQ = [
  { q: 'What exactly does Eudaimonai measure?', a: 'During a session you start: whether you are at your desk, where you are facing (a screen, your notes, or away), eyes closed for longer than a blink, and which app or website is in front. From that it shows your attention over time, deep focus, lapses and how quickly you come back. It observes behaviour, not thoughts or feelings.' },
  { q: 'Does it record or upload camera video?', a: 'No. Frames are analysed in memory on your Mac and discarded. Only measurements are kept, and they stay on your Mac.' },
  { q: 'What data leaves my Mac?', a: 'Your email address, your invitation and your beta access, which sign you in. The app also checks that access and looks for updates. Your sessions, history and anything from the camera stay on your Mac.' },
  { q: 'Why does it need the camera?', a: 'To estimate your attention during a session. It only runs while a session you started is running.' },
  { q: 'Which Macs are supported?', a: 'Apple Silicon Macs (M1 or newer) with macOS 11 or later and a camera. The built-in one works. Intel Macs, Windows and phones are not supported.' },
  { q: 'How does the closed beta work?', a: 'Request access with your email. We invite people in small groups. Your invitation has one link to activate your access with a one-time code, then you download the app and sign in with the same email.' },
  { q: 'How long does beta access last, and is it free?', a: 'It is free. Access runs for a set period from activation, 60 days for the first group, and you see your exact end date when you activate.' },
  { q: 'What happens to my history when access ends?', a: 'It stays on your Mac and stays readable in the app. Starting new sessions needs access again.' },
  { q: 'Can I use it on another Mac?', a: 'Yes, sign in with the same email. Your history stays on the Mac where it was recorded; it does not sync between Macs.' },
  { q: 'Do I have to block websites?', a: 'No. Blocking is optional for each session. Measuring your focus works without it.' },
]

function AccessSteps() {
  const ref = useRef(null)
  const seen = useSeen(ref, 0.5)
  return (
    <ol className={`site-path${seen ? ' is-seen' : ''}`} ref={ref}>
      {ACCESS_STEPS.map((step, index) => (
        <li key={step.title} style={{ '--i': index }}>
          <b>{step.title}</b>
          <span>{step.body}</span>
        </li>
      ))}
    </ol>
  )
}

export default function LandingPage({ api }) {
  const rootRef = useRef(null)
  useReveal(rootRef)

  return (
    <div className="site" ref={rootRef}>
      <SiteHeader />

      <main id="top">
        <section className="site-hero" id="app">
          <div className="site-wrap site-hero-copy">
            <p className="site-eyebrow"><LogoMark size={22} tone="ink" />Eudaimonai for Mac</p>
            <h1>The focus instrument.</h1>
            <p className="site-hero-sub">
              Built for work that needs your full attention. Eudaimonai measures yours, second by second,
              and shows you exactly how to get more of it.
            </p>
            <div className="site-hero-form">
              <RequestAccessForm api={api} privacyHref="/privacy" />
            </div>
            <p className="site-scarcity"><i />Closed beta · Limited places · Already invited? <a href="/activate">Activate your access</a></p>
          </div>
          <div className="site-wrap site-hero-stage">
            <AppShowcase />
          </div>
        </section>

        <SpecBand />

        <section className="site-band" id="how">
          <div className="site-wrap">
            <div className="site-head site-rv">
              <p className="site-label">How it works</p>
              <h2>From plan to score, in five steps.</h2>
              <p>What happens when you start a session, and how the camera on your Mac turns where you look into a number.</p>
            </div>
            <HowItWorks />
          </div>
        </section>

        <section className="site-band is-ultra" id="why">
          <WhySection />
        </section>

        <section className="site-band" id="privacy">
          <div className="site-wrap">
            <div className="site-head site-rv">
              <p className="site-label">Privacy</p>
              <h2>Your focus data stays on your Mac.</h2>
              <p>A camera on your desk should earn its place. Here is exactly what it does, and where every piece of data lives.</p>
            </div>
            <PrivacyMap />
            <p className="site-perm site-rv">
              <b>What it asks for:</b> your camera, to measure attention during a session. Only if you use blocking:
              browser access, to see which site is in front, and your admin password once, to install the small helper
              that blocks the sites you list. <a href="/privacy">Read the privacy policy</a>
            </p>
          </div>
        </section>

        <section className="site-band is-night" id="access">
          <div className="site-wrap">
            <div className="site-head site-head-center site-rv">
              <p className="site-label">Closed beta · Limited places</p>
              <h2>Your best work deserves to be measured.</h2>
              <p>Built for work that needs long stretches of attention: students, founders, engineers, researchers, writers.</p>
            </div>
            <AccessSteps />
            <div className="site-access-form site-rv">
              <RequestAccessForm api={api} privacyHref="/privacy" />
              <p className="site-fine">
                Apple Silicon Mac (M1 or newer) · macOS 11 or later · a camera · Already invited?{' '}
                <a href="/activate">Activate your access</a>
              </p>
            </div>
          </div>
        </section>

        <section className="site-band is-faq" id="faq">
          <div className="site-wrap">
            <div className="site-faq">
              <h2 className="site-label">Questions</h2>
              <div className="site-qa">
                {FAQ.map(item => (
                  <details key={item.q}>
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter sampleNote />
    </div>
  )
}
