import { useEffect, useRef, useState } from 'react'
import {
  cameraAccessFailureMessage,
  isReadinessCancellation,
  prepareCameraPreview,
  releaseCameraStream,
  stalledCameraMessage,
} from '../lib/cameraReadiness'

// ── Premium onboarding ────────────────────────────────────────────────────────
// The whole point of these first 30 seconds: don't *tell* people the webcam
// reads their focus — *show* them. The flow ends on a live preview moment so
// the user can see that camera presentation works before entering the app.

const font = 'var(--ds-font)'
const TRANSITION_MS = 220

// Text buttons follow the shared control layer: accent-as-text, no fill, and
// the arrow cursor like every other control in the app.
const textButtonStyle = (busy = false) => ({
  background: 'none', border: 'none', padding: '2px 6px',
  fontSize: 13, fontWeight: 500, color: 'var(--ds-accent-text)', fontFamily: font,
  opacity: busy ? 0.7 : 1,
})

const SLIDES = [
  {
    kicker: 'Eudaimonai',
    title: 'Meet your\nfocus guardian',
    // Apple's welcome-screen pattern: one row per thing the app does. Each
    // line states only what the code does — e.g. not "the moment you drift":
    // the alert waits for sustained low attention (about 1–2 min, see
    // alertDelayMs in SessionScreen.jsx), and nothing runs outside a session.
    features: [
      { icon: 'timer', title: 'Measured sessions', text: 'Pick a task and a length. While the session runs, your camera measures how focused you are.' },
      { icon: 'bell', title: 'A nudge when you drift', text: 'If your attention stays low for a minute or two, a reminder and a short sound bring you back.' },
      { icon: 'shield', title: 'Optional blocking', text: 'Choose apps and websites to hide or block during a session. Nothing is blocked outside one.' },
      { icon: 'chart', title: 'Your progress', text: 'The Lab shows today’s Focus Score. Analytics compares your sessions over time.' },
    ],
    cta: 'Continue',
  },
  {
    kicker: 'How it works',
    title: 'It reads the\nsignals of focus',
    // "No data leaves your device. Ever." was the old line. It was not true:
    // the app asks GitHub for updates on launch and every five minutes, which
    // sends an IP address. Naming what actually stays — the camera and the
    // sessions — is both accurate and a stronger claim than an absolute one
    // a single network call disproves. Keep it that way; see LegalModal.jsx.
    // "Attention", not "focus score": the Focus Score is the daily number in
    // the Lab; what a session shows live is attention.
    // "Up to 15 times a second": NATIVE_CAMERA_MAX_FPS in capture.rs.
    body: 'Up to 15 times a second it reads your blinking, how open your eyes are, where your head points and where you look, and turns that into an attention score from 0 to 100. No video is recorded, and nothing from your camera or your sessions leaves your Mac.',
    cta: 'Continue',
  },
  {
    // Not "One permission": Protection asks for Automation and an admin
    // helper later. The camera is the only one onboarding needs.
    kicker: 'Camera access',
    title: 'Let it see\nyour focus',
    body: 'Eudaimonai needs your camera to measure attention. Frames are processed on your Mac in real time and never stored. macOS will ask for permission next.',
    cta: 'Enable camera',
  },
]

// SF Symbols-style line icons (1.5 px stroke on a 20 px grid), the same idiom
// as the workspace glyphs and the sidebar.
const FEATURE_ICONS = {
  timer: <><circle cx="10" cy="11" r="6.75" /><path d="M10 7.5V11l2.25 1.75M8 2.25h4M10 2.25v2" /></>,
  bell: <><path d="M5 13.75V9a5 5 0 0 1 10 0v4.75l1.25 1.5H3.75z" /><path d="M8.25 17.25a1.9 1.9 0 0 0 3.5 0" /></>,
  shield: <><path d="M10 2.25 4 4.5v4.75c0 4 2.6 6.9 6 8.5 3.4-1.6 6-4.5 6-8.5V4.5z" /><path d="m7.5 10 1.75 1.75L12.75 8.25" /></>,
  chart: <><path d="M3.25 16.75h13.5" /><path d="M5.5 13.5v-3M10 13.5v-8M14.5 13.5V8.5" /></>,
}

function FeatureIcon({ name }) {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {FEATURE_ICONS[name]}
    </svg>
  )
}

// The recurring brand motif — a focus ring. Rendered at different intensities.
function RingMark({ size = 88, active = false }) {
  const r = size / 2 - 6
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="url(#ringGrad)" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (active ? 0.12 : 0.55)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)' }}
      />
      <circle cx={size / 2} cy={6} r={3.5} fill="var(--ds-label)"
        style={{ transformOrigin: `${size / 2}px ${size / 2}px`, animation: 'ringSpin 3.6s linear infinite' }} />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#9AA3B5" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// `renderAccessStep({ onDone })`, when given, is shown before the camera
// slide: nobody is asked for the camera before their beta access is settled.
export default function Onboarding({ onComplete, onOpenPrivacy, renderAccessStep = null }) {
  const [step, setStep] = useState(0)        // 0..2 slides, 3 = awakening
  const [accessSettled, setAccessSettled] = useState(!renderAccessStep)
  const [visible, setVisible] = useState(true)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [awakenPhase, setAwakenPhase] = useState('scanning') // scanning → locked
  const [awakenError, setAwakenError] = useState(null)
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const awakenActionRef = useRef(null)
  const transitionRef = useRef(null)

  const isAwakening = step === 3

  // Attach / detach the live webcam during the awakening moment.
  useEffect(() => {
    if (!isAwakening || !streamRef.current) return
    const v = videoRef.current
    const stream = streamRef.current
    const controller = new AbortController()
    let cancelled = false

    // A camera permission grant is not a measurement. Wait for the preview to
    // present advancing frames before claiming that the tracker is ready.
    prepareCameraPreview(v, stream, { signal: controller.signal })
      .then(() => {
        if (cancelled) return
        setAwakenPhase('locked')
      })
      .catch(error => {
        // Filter on OUR signal, never on `error.name`: video.play() rejects
        // with an AbortError of its own, and swallowing that one strands the
        // user on "Checking your camera…" with no way forward.
        if (cancelled || isReadinessCancellation(error)) return
        setAwakenError(error?.code === 'no_advancing_frames'
          ? stalledCameraMessage()
          : cameraAccessFailureMessage(error))
        setAwakenPhase('failed')
        stopStream()
      })

    return () => {
      cancelled = true
      controller.abort()
      if (streamRef.current === stream) stopStream()
    }
  }, [isAwakening, cameraAttempt])

  // Always release the camera, and drop a pending slide change, when leaving
  // onboarding.
  useEffect(() => () => {
    clearTimeout(transitionRef.current)
    stopStream()
  }, [])

  // Resolving the check swaps the whole action area in. The button the user
  // pressed to get here is already unmounted, so without this a keyboard user
  // is parked on <body> and has to tab in from the top of the document to
  // reach the only way forward.
  useEffect(() => {
    if (!isAwakening || awakenPhase === 'scanning') return
    awakenActionRef.current?.focus()
  }, [isAwakening, awakenPhase])

  function stopStream() {
    if (streamRef.current) {
      releaseCameraStream(streamRef.current, videoRef.current)
      streamRef.current = null
    }
  }

  // Both ways out — a working preview and an explicit skip — end here.
  function completeOnboarding() {
    stopStream()
    // A storage failure must not trap the user on this screen; at worst the
    // intro shows again on the next launch.
    try { localStorage.setItem('eudaimonia_onboarded', 'true') } catch {}
    onComplete()
  }

  // The slide button stays mounted while its label changes, so the second
  // click of a double-click used to land on the next slide: "Show me" skipped
  // the privacy slide, and "Continue" fired the camera prompt unread. Input is
  // ignored until the new slide has fully faded in, and repeat clicks of a
  // double-click are ignored outright.
  const transitionTo = (next) => {
    if (transitionRef.current) return
    setVisible(false)
    transitionRef.current = setTimeout(() => {
      setStep(next)
      setVisible(true)
      transitionRef.current = setTimeout(() => { transitionRef.current = null }, TRANSITION_MS)
    }, TRANSITION_MS)
  }

  const handleSlideAction = (event) => {
    if (event.detail > 1 || transitionRef.current) return
    if (step === 2) handleEnableCamera()
    else transitionTo(step + 1)
  }

  const handleEnableCamera = async () => {
    setError(null)
    setAwakenError(null)
    setLoading(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      setLoading(false)
      setAwakenPhase('scanning')
      transitionTo(3) // → the awakening
    } catch (err) {
      setLoading(false)
      setError(cameraAccessFailureMessage(err))
    }
  }

  // The way out ("Continue without camera" → completeOnboarding). Without it
  // this screen is a wall: onboarded is only stored on success, so a reflexive
  // "Don't Allow" — or a camera Zoom happens to be holding — locks the user out
  // of the app entirely, on the first interaction after install. Offered only
  // once the camera has actually failed, so the happy path is still "grant it".

  const handleRetryCamera = async () => {
    stopStream()
    setAwakenError(null)
    setLoading(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      setAwakenPhase('scanning')
      setCameraAttempt(attempt => attempt + 1)
    } catch (error) {
      setAwakenError(cameraAccessFailureMessage(error))
      setAwakenPhase('failed')
    } finally {
      setLoading(false)
    }
  }

  const slide = SLIDES[step] || SLIDES[0]
  const showAccessStep = step === 2 && !accessSettled

  const goodGlow = alpha => `color-mix(in srgb, var(--ds-good) ${alpha}%, transparent)`

  return (
    <div style={{
      // Scrolls rather than clips: the window can be 560 px tall, less than
      // the welcome list or a camera error needs. Children centre with
      // margin: auto, which (unlike align-items) never pushes content above
      // the scrollable area.
      position: 'fixed', inset: 0, zIndex: 300, overflowX: 'hidden', overflowY: 'auto',
      background: 'var(--ds-bg)', fontFamily: font,
      display: 'flex', flexDirection: 'column',
      padding: '32px 24px',
    }}>
      <style>{`
        @keyframes ringSpin { to { transform: rotate(360deg); } }
        @keyframes ambientPulse { 0%,100% { opacity: .5; transform: translate(-50%,-50%) scale(1); } 50% { opacity: .85; transform: translate(-50%,-50%) scale(1.12); } }
        @keyframes riseIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scanSweep { 0% { transform: translateY(-100%); } 100% { transform: translateY(100%); } }
        @keyframes lockPop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes softPulse { 0%,100% { box-shadow: 0 0 0 0 transparent; } 50% { box-shadow: 0 0 0 6px ${goodGlow(10)}; } }
        .ob-cta { min-height: 44px; font-size: 15px; }
        .ob-cta:hover { background: var(--ds-accent-hover); }
        .ob-cta:active { transform: scale(0.97); }
      `}</style>

      {/* Ambient glow, in its own fixed layer so it never adds scroll area */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: '46%', left: '50%',
          width: 620, height: 620, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(122,152,255,0.85) 0%, rgba(14,22,44,0.35) 40%, transparent 70%)',
          animation: 'ambientPulse 7s ease-in-out infinite',
        }} />
      </div>

      {showAccessStep ? (
        // ── Beta access, before the camera is asked for ───────────────────────
        <div style={{ position: 'relative', width: '100%', margin: 'auto', display: 'flex', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity .22s ease' }}>
          {renderAccessStep({ onDone: () => setAccessSettled(true) })}
        </div>
      ) : !isAwakening ? (
        // ── Slides ────────────────────────────────────────────────────────────
        <div style={{ position: 'relative', width: '100%', maxWidth: 440, margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
          <div aria-hidden="true" style={{ opacity: visible ? 1 : 0, transition: 'opacity .22s ease' }}>
            <RingMark size={92} active={step >= 1} />
          </div>

          <div key={step} style={{
            textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 168,
            opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(10px)',
            transition: 'opacity .22s ease, transform .22s ease',
          }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ds-label-3)' }}>
              {slide.kicker}
            </span>
            <h1 style={{ fontSize: 'clamp(30px,7vw,40px)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', lineHeight: 1.08, margin: 0, whiteSpace: 'pre-line' }}>
              {slide.title}
            </h1>
            {slide.features ? (
              <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
                {slide.features.map(feature => (
                  <li key={feature.title} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', columnGap: 14, alignItems: 'start' }}>
                    <span style={{ color: 'var(--ds-label)', paddingTop: 1 }}><FeatureIcon name={feature.icon} /></span>
                    <span>
                      <strong style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--ds-label)', lineHeight: 1.35 }}>{feature.title}</strong>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--ds-label-2)', lineHeight: 1.5 }}>{feature.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 16, color: 'var(--ds-label-2)', lineHeight: 1.65, margin: '2px auto 0', maxWidth: 380, fontWeight: 400 }}>
                {slide.body}
              </p>
            )}
          </div>

          {error && (
            <div role="alert" style={{ background: 'color-mix(in srgb, var(--ds-bad) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--ds-bad) 40%, transparent)', borderRadius: 12, padding: '11px 15px', fontSize: 13, color: 'var(--ds-label)', lineHeight: 1.5, textAlign: 'center', maxWidth: 400 }}>
              {error}
            </div>
          )}

          <button
            className="ob-cta ds-button-primary"
            onClick={handleSlideAction}
            disabled={loading}
            style={{ width: '100%', maxWidth: 340, opacity: loading ? 0.7 : 1 }}
          >
            {/* After a denial macOS does not ask again, so the same button
                re-checks once the user has changed System Settings. */}
            {loading ? 'Requesting camera…' : error && step === 2 ? 'Try again' : slide.cta}
          </button>

          {step === 2 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 18, marginTop: -18 }}>
              {error && (
                <button type="button" onClick={completeOnboarding} style={textButtonStyle()}>
                  Continue without camera
                </button>
              )}
              {onOpenPrivacy && (
                <button type="button" onClick={onOpenPrivacy} style={textButtonStyle()}>
                  Privacy Policy
                </button>
              )}
            </div>
          )}

          <div role="img" aria-label={`Step ${step + 1} of ${SLIDES.length}`} style={{ display: 'flex', gap: 7 }}>
            {SLIDES.map((_, i) => (
              <div key={i} style={{ width: i === step ? 22 : 6, height: 6, borderRadius: 3, background: i === step ? 'var(--ds-label-2)' : 'var(--ds-fill-strong)', transition: 'width .3s ease, background .3s ease' }} />
            ))}
          </div>
        </div>
      ) : (
        // ── The awakening: live "it sees you" moment ──────────────────────────
        <div style={{ position: 'relative', margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, animation: 'riseIn .5s ease' }}>
          <div style={{
            position: 'relative', width: 260, height: 260, borderRadius: '50%',
            animation: awakenPhase === 'locked' ? 'softPulse 2s ease-in-out infinite' : 'none',
          }}>
            {/* Live webcam, circular, mirrored */}
            <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', overflow: 'hidden', background: '#0D0F14' }}>
              <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', filter: awakenPhase === 'locked' ? 'saturate(1.05)' : 'grayscale(0.5) brightness(0.85)', transition: 'filter .8s ease' }} />
              {/* scan sweep while calibrating */}
              {awakenPhase === 'scanning' && (
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg, transparent, rgba(100,149,237,0.28), transparent)', animation: 'scanSweep 1.6s ease-in-out infinite' }} />
                </div>
              )}
            </div>

            {/* Ring around the face */}
            <svg width={260} height={260} viewBox="0 0 260 260" style={{ position: 'absolute', inset: 0 }}>
              <circle cx="130" cy="130" r="122" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
              <circle
                cx="130" cy="130" r="122" fill="none"
                stroke={awakenPhase === 'locked' ? 'var(--ds-good)' : 'var(--ultra-bright)'} strokeWidth="3.5" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 122}
                strokeDashoffset={(2 * Math.PI * 122) * (awakenPhase === 'locked' ? 0 : 0.35)}
                transform="rotate(-90 130 130)"
                style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1), stroke .6s ease', filter: awakenPhase === 'locked' ? `drop-shadow(0 0 12px ${goodGlow(50)})` : 'drop-shadow(0 0 10px rgba(100,149,237,0.4))' }}
              />
            </svg>

            {/* Lock checkmark */}
            {awakenPhase === 'locked' && (
              <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 40, height: 40, borderRadius: '50%', background: 'var(--ds-good)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'lockPop .5s cubic-bezier(0.22,1,0.36,1)', boxShadow: `0 6px 20px ${goodGlow(50)}` }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="var(--ds-bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
            )}
          </div>

          {/* The outcome of the check is the whole point of this screen, and on
              failure this text carries the only remedy. Announce it rather than
              leaving a screen-reader user on a silent "Checking your camera…". */}
          <div role="status" aria-live="polite" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', margin: 0, transition: 'all .4s ease' }}>
              {awakenPhase === 'locked' ? 'Live preview is ready.' : awakenPhase === 'failed' ? 'Camera is not ready.' : 'Checking your camera…'}
            </h2>
            <p id="onboarding-camera-readiness-message" style={{ fontSize: 14.5, color: 'var(--ds-label-2)', margin: 0, lineHeight: 1.5, maxWidth: 520 }}>
              {awakenPhase === 'locked' ? 'Your camera works. Attention measurement begins when a session starts.' : awakenPhase === 'failed' ? awakenError : 'Waiting for live frames from the camera.'}
            </p>
          </div>
          {awakenPhase === 'failed' && (
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <button type="button" ref={awakenActionRef} onClick={handleRetryCamera} disabled={loading} aria-describedby="onboarding-camera-readiness-message" style={textButtonStyle(loading)}>
                {loading ? 'Requesting camera…' : 'Try camera again'}
              </button>
              <button type="button" onClick={completeOnboarding} disabled={loading} aria-describedby="onboarding-camera-readiness-message" style={textButtonStyle(loading)}>
                Continue without camera
              </button>
            </div>
          )}
          {awakenPhase === 'locked' && (
            <button type="button" ref={awakenActionRef} className="ob-cta ds-button-primary" onClick={completeOnboarding} aria-describedby="onboarding-camera-readiness-message" style={{ width: '100%', maxWidth: 340 }}>
              Continue
            </button>
          )}
        </div>
      )}
    </div>
  )
}
