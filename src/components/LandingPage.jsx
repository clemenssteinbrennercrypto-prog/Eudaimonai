import { useState } from 'react'
import LegalModal from './LegalModal'
import RequestAccessForm from '../web/RequestAccessForm'

// A session is the unit of the product: focus time only counts inside one, and
// blocking is an optional rule set the user brings to it. Keep the copy from
// promising background tracking or "one click blocks everything".
const STEPS = [
  {
    num: '01',
    title: 'Start a session',
    body: 'Name what you are working on and pick a length. Only time inside a session counts as focus time.',
  },
  {
    num: '02',
    title: 'Work, measured',
    body: 'The camera estimates your attention on your Mac. Your chosen setup keeps out the apps and sites you picked, or nothing at all.',
  },
  {
    num: '03',
    title: 'See your day in one number',
    body: 'Your Focus Score sums up the day. Over time, Eudaimonai shows which hours and session lengths work best for you.',
  },
]

const FAQ = [
  { q: 'Is my camera footage stored?', a: 'No. Frames are analysed in memory on your Mac and discarded. Only measurements such as head position and blink rate are kept, and they stay on your Mac.' },
  { q: 'Do I have to block anything?', a: 'No. You choose what to keep out during a session, if anything. Measuring your focus works without blocking.' },
  { q: 'What does it ask access to?', a: 'Your camera, to estimate attention during a session. Browser access, to see which app or site is in front and keep blocked ones closed. And your admin password once, to install a small helper that blocks the sites you list.' },
  { q: 'Which Macs are supported?', a: 'Apple Silicon Macs with an M1 chip or newer, running macOS 11 or later, with a camera. The built-in one works. Intel Macs are not supported.' },
  { q: 'How do I get in?', a: 'Eudaimonai is in a closed beta. Request access with your email address and we invite people in small groups. Your invitation email has one link to activate your access, confirmed with a one-time code. There is no password.' },
  { q: 'What do you store about me?', a: 'Only what runs the beta: your email address, your invitation and how long your access lasts, stored on servers in the EU. Your focus sessions, history and anything from your camera stay on your Mac and are never uploaded.' },
  { q: 'Is it free?', a: 'Free during the closed beta. You need an invitation, and no credit card.' },
]

const font = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif'

// During the closed beta the primary action is requesting access; the
// download lives on /download for people who were invited.
export default function LandingPage({ api }) {
  const [legalTab, setLegalTab] = useState(null)

  return (
    <div style={{ fontFamily: font, overflowX: 'hidden' }}>

      <style>{`
        @keyframes heroGlow {
          0%, 100% { opacity: 0.7; transform: translate(-50%, -55%) scale(1); }
          50% { opacity: 1; transform: translate(-50%, -55%) scale(1.08); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-cta:hover {
          box-shadow: 0 0 0 1px rgba(255,255,255,0.15), 0 8px 32px rgba(100,149,237,0.35) !important;
          transform: translateY(-1px);
        }
        .hero-cta:active { transform: translateY(0); }
        .step-card:hover {
          border-color: rgba(100,149,237,0.25) !important;
          background: rgba(255,255,255,0.04) !important;
        }
        .faq-card:hover { border-color: rgba(255,255,255,0.14) !important; }
        .pill-btn:hover { color: #ffffff !important; }
        @media (prefers-reduced-motion: reduce) {
          .landing-motion { animation: none !important; }
        }
      `}</style>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section style={{
        minHeight: '100vh',
        background: '#080A0F',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px',
        position: 'relative', overflow: 'hidden',
      }}>

        {/* Layered glow background */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        }}>
          {/* Primary blue glow */}
          <div style={{
            position: 'absolute',
            width: '80vw', height: '80vw',
            maxWidth: 900, maxHeight: 900,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(122,152,255,0.9) 0%, rgba(14,22,44,0.4) 40%, transparent 70%)',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -55%)',
            animation: 'heroGlow 8s ease-in-out infinite',
          }} className="landing-motion" />
          {/* Secondary accent glow */}
          <div style={{
            position: 'absolute',
            width: '40vw', height: '40vw',
            maxWidth: 500, maxHeight: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(100,149,237,0.08) 0%, transparent 70%)',
            top: '40%', left: '50%',
            transform: 'translate(-50%, -50%)',
          }} />
          {/* Grid pattern */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse at 50% 50%, black 30%, transparent 80%)',
          }} />
        </div>

        <div style={{
          maxWidth: 640, width: '100%', textAlign: 'center',
          position: 'relative', zIndex: 1,
          animation: 'fadeUp 0.6s ease',
        }} className="landing-motion">

          {/* Label pill */}
          <div style={{ marginBottom: 28 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
              color: '#9AA6C8',
              border: '1px solid rgba(154,166,200,0.3)',
              borderRadius: 100, padding: '6px 16px',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--ultra-bright)',
                boxShadow: '0 0 6px #6496ed',
                display: 'inline-block',
              }} />
              Beta · for Apple Silicon Macs
            </span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 'clamp(42px, 7vw, 76px)',
            fontWeight: 700, letterSpacing: '-0.035em',
            lineHeight: 1.05, margin: '0 0 24px',
            background: 'linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.72) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Lock in.<br />See it pay off.
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: 18, color: 'rgba(255,255,255,0.72)', lineHeight: 1.7,
            maxWidth: 500, margin: '0 auto 44px',
            letterSpacing: '0.01em',
          }}>
            Eudaimonai is a Mac app for focus sessions. Start one and it
            measures how focused you really are, keeps out whatever you chose
            to block, and sums up your day in one Focus Score.
          </p>

          {/* CTA */}
          <div id="request-access" style={{ scrollMarginTop: 120 }}>
            <RequestAccessForm api={api} onOpenPrivacy={() => setLegalTab('datenschutz')} />
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '14px 0 0' }}>
            Already invited?{' '}
            <a href="/activate" style={{ color: 'rgba(255,255,255,0.85)' }}>Activate your access</a>
            {' · '}
            <a href="/download" style={{ color: 'rgba(255,255,255,0.85)' }}>Download</a>
          </p>

          {/* Trust pills */}
          <div style={{
            display: 'flex', gap: 6, marginTop: 20,
            justifyContent: 'center', flexWrap: 'wrap',
          }}>
            {[
              'Camera data stays on your Mac',
              'M1 or newer · macOS 11+',
              'Free during the closed beta',
            ].map((label) => (
              <span key={label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 13px', borderRadius: 100,
                background: 'rgba(122,152,255,0.06)',
                border: '1px solid rgba(255,255,255,0.07)',
                fontSize: 12, color: 'rgba(255,255,255,0.68)', fontWeight: 500,
              }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section style={{ background: '#0A0C12', padding: '100px 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>

          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <span style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em',
              color: '#9AA6C8', display: 'block', marginBottom: 14,
            }}>
              How it works
            </span>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700,
              letterSpacing: '-0.03em', color: 'var(--text)', margin: 0,
            }}>
              How a session works
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {STEPS.map((s) => (
              <div
                key={s.num}
                className="step-card"
                style={{
                  display: 'flex', gap: 28, alignItems: 'flex-start',
                  padding: '28px 32px',
                  background: 'rgba(122,152,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 16,
                  transition: 'all 0.2s ease',
                  cursor: 'default',
                }}
              >
                <span style={{
                  fontSize: 13, fontWeight: 600, color: 'var(--ultra-bright)',
                  letterSpacing: '0.05em', flexShrink: 0, marginTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {s.num}
                </span>
                <div>
                  <p style={{
                    fontSize: 17, fontWeight: 600, color: 'var(--text)',
                    margin: '0 0 7px', letterSpacing: '-0.015em',
                  }}>
                    {s.title}
                  </p>
                  <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.68)', lineHeight: 1.7, margin: 0 }}>
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRIVACY CALLOUT ───────────────────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(135deg, #0f1e35 0%, var(--ultra) 50%, #0f1e35 100%)',
        padding: '88px 24px',
        textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(100,149,237,0.08) 0%, transparent 60%)',
        }} />
        <div style={{ maxWidth: 560, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <h2 style={{
            fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 700,
            color: 'var(--text)', margin: '0 0 18px', letterSpacing: '-0.025em',
          }}>
            Your focus data stays on your Mac
          </h2>
          <p style={{
            fontSize: 16, color: 'rgba(255,255,255,0.88)', lineHeight: 1.75,
            margin: '0 auto 36px',
          }}>
            The camera image is analysed in memory on your Mac and thrown
            away. Your sessions and history stay in a local database you can
            delete at any time; they are never uploaded. Our server only keeps
            what runs the beta: your email address and your access. Besides
            that, the app only checks your beta access and looks for updates.
          </p>
          <a
            href="#request-access"
            className="hero-cta"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface)', color: 'var(--ultra-bright)',
              border: 'none', height: 52, padding: '0 32px',
              borderRadius: 12, fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: font,
              transition: 'all 0.2s ease',
              letterSpacing: '0.01em', textDecoration: 'none',
            }}
          >
            Request beta access
          </a>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section style={{ background: '#080A0F', padding: '80px 24px' }}>
        <div style={{ maxWidth: 580, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.8)',
            marginBottom: 32, textAlign: 'center', letterSpacing: '-0.02em',
          }}>
            Common questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {FAQ.map(({ q, a }) => (
              <div key={q} className="faq-card" style={{
                padding: '20px 24px',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                transition: 'border-color 0.2s',
              }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.85)', margin: '0 0 7px' }}>{q}</p>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.68)', margin: 0, lineHeight: 1.65 }}>{a}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <a
              href="#request-access"
              className="hero-cta"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--ultra)', color: 'var(--text)',
                border: '1px solid rgba(100,149,237,0.3)', height: 52, padding: '0 32px',
                borderRadius: 14, fontSize: 15, fontWeight: 600,
                cursor: 'pointer', fontFamily: font,
                transition: 'all 0.2s ease', textDecoration: 'none',
              }}
            >
              Request beta access
            </a>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '14px 0 0' }}>
              Closed beta · Apple Silicon · macOS 11 or later ·{' '}
              <a href="/download" style={{ color: 'rgba(255,255,255,0.85)' }}>Already invited? Download</a>
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{
        background: '#080A0F',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '20px 24px',
      }}>
        <div style={{
          maxWidth: 680, margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
            Eudaimonai
          </span>
          <div style={{ display: 'flex', gap: 20 }}>
            {[
              { id: 'impressum',   label: 'Legal Notice'   },
              { id: 'datenschutz', label: 'Privacy Policy' },
            ].map(({ id, label }) => (
              <button
                key={id}
                className="pill-btn"
                onClick={() => setLegalTab(id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'rgba(255,255,255,0.6)',
                  fontFamily: font, transition: 'color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </footer>

      <LegalModal
        open={legalTab !== null}
        onClose={() => setLegalTab(null)}
        initialTab={legalTab ?? 'impressum'}
      />
    </div>
  )
}
