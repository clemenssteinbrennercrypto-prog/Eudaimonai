import { useEffect, useRef, useState } from 'react'
import { formatDuration, formatTimer } from '../lib/durationFormat'

const REASON_LABELS = {
  away: '→ looking away',
  phone: '→ phone detected',
  distraction_app: '→ wrong app open',
  prolonged: '→ eyes tired',
  yawn: '→ yawning',
  lookingup: '→ mind wandering',
  focused: null,
  default: null,
}

function formatShortDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return formatDuration(total)
}

// ── Focus Ring (SVG) ──────────────────────────────────────────────────────────
// The live counterpart of the Lab's score rings. Outer platinum ring: how much
// of the planned session has passed (no arc without a time limit, so nothing
// pretends to a length that was never set). Inner ring: the live attention
// score in the shared band colours. While the live Flow state is active the
// inner ring breathes slowly; that is presentation only and reads the
// existing inFlowState, it never feeds back into scoring.
export function FocusRing({
  score,
  timeLeft,
  totalSeconds = null,
  isCalibrating,
  isPaused,
  inFlow = false,
  calibProgress = 0,
  focusedThreshold = 65,
  alertThreshold = 38,
  countUp = false,
}) {
  const size = 240
  const c = size / 2
  const outerRadius = 112
  const innerRadius = 100
  const outerCirc = 2 * Math.PI * outerRadius
  const innerCirc = 2 * Math.PI * innerRadius
  const progress = !countUp && Number.isFinite(totalSeconds) && totalSeconds > 0 && Number.isFinite(timeLeft)
    ? Math.min(1, Math.max(0, 1 - timeLeft / totalSeconds))
    : null
  const fill = isCalibrating ? calibProgress : score / 100

  const tone = isCalibrating
    ? 'is-calibrating'
    : score >= focusedThreshold ? 'is-good'
    : score >= alertThreshold ? 'is-warn'
    : 'is-bad'

  return (
    <div className={`live-ring ${tone}${isCalibrating ? ' ring--calibrating' : ''}${inFlow && !isCalibrating && !isPaused ? ' is-flow' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <linearGradient id="live-ring-platinum" gradientUnits="userSpaceOnUse" x1={size} y1="0" x2="0" y2={size}>
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#C9CFDB" />
          </linearGradient>
        </defs>
        <circle className="live-ring-track" cx={c} cy={c} r={outerRadius} />
        {progress != null && progress > 0 && (
          <circle
            className="live-ring-progress"
            cx={c} cy={c} r={outerRadius}
            strokeDasharray={outerCirc}
            strokeDashoffset={outerCirc * (1 - progress)}
            transform={`rotate(-90 ${c} ${c})`}
          />
        )}
        <circle className="live-ring-track" cx={c} cy={c} r={innerRadius} />
        <circle
          className="live-ring-attention"
          cx={c} cy={c} r={innerRadius}
          strokeDasharray={innerCirc}
          strokeDashoffset={innerCirc * (1 - fill)}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div className="live-ring-center">
        <span className="timer" style={{ color: isPaused ? 'var(--text-muted)' : undefined }}>{formatTimer(timeLeft)}</span>
        {countUp && <span className="live-ring-caption">No time limit</span>}
        {!countUp && inFlow && !isCalibrating && !isPaused && <span className="live-ring-caption">Deep Focus</span>}
      </div>
    </div>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  focused:    { color: 'var(--good)', label: 'Focused'    },
  distracted: { color: 'var(--warn)', label: 'Distracted' },
  alert:      { color: 'var(--bad)', label: 'Alert'      },
  uncertain:  { color: 'var(--text-secondary)', label: 'Camera can barely see you'},
  calibrating:{ color: 'var(--text-secondary)', label: 'Calibrating'},
}

// ── Signal quality bars ───────────────────────────────────────────────────────
function SignalBars({ confidence }) {
  // 0..1 → 0, 1, 2, or 3 filled bars
  const filled = confidence >= 0.85 ? 3 : confidence >= 0.5 ? 2 : confidence >= 0.2 ? 1 : 0
  const barColor = filled === 3 ? 'var(--good)' : filled >= 1 ? 'var(--warn)' : 'var(--text-muted)'
  return (
    <div title={`Detection quality: ${Math.round(confidence * 100)}%`} style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          width: 3,
          height: 4 + i * 3,
          borderRadius: 1.5,
          background: i <= filled ? barColor : 'var(--line-strong)',
          transition: 'background 0.4s',
        }} />
      ))}
    </div>
  )
}

// ── Sparkline ──────────────────────────────────────────────────────────────
function Sparkline({ scores, scoreColor }) {
  if (!scores || scores.length < 2) return null
  const W = 80, H = 24, PAD = 2
  const pts = scores
  const mn = 0, mx = 100
  const points = pts.map((v, i) => {
    const x = PAD + (i / (pts.length - 1)) * (W - PAD * 2)
    const y = PAD + (1 - (v - mn) / (mx - mn)) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={W} height={H} style={{ display: 'block', opacity: 0.7 }}>
      <polyline
        points={points}
        fill="none"
        stroke={scoreColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StatusDot({ status, score, reason, isCalibrating, confidence = 0, scoreHistory = [] }) {
  const cfg = isCalibrating ? STATUS_CONFIG.calibrating : (STATUS_CONFIG[status] ?? STATUS_CONFIG.focused)
  const { color, label } = cfg
  const showReason = !isCalibrating && (status === 'distracted' || status === 'alert')
  const reasonText = showReason ? (REASON_LABELS[reason] ?? null) : null

  // Trend arrow — compare score every 10s
  const prevScoreRef = useRef(score)
  const scoreRef = useRef(score)
  scoreRef.current = score
  const [trend, setTrend] = useState('→')
  useEffect(() => {
    // Keep the display awake while a visible focus session is running. This
    // prevents macOS display sleep from suspending the camera/WebView. Wake
    // Lock cannot prevent background WebView throttling, so backgrounding is
    // handled separately below by pausing the session.
    let wakeLock = null
    let cancelled = false
    const acquireWakeLock = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      try {
        if (navigator.wakeLock?.request) {
          wakeLock = await navigator.wakeLock.request('screen')
        }
      } catch {
        // Wake Lock is optional on some WKWebView versions; camera health and
        // the background pause guard remain the source of truth.
      }
    }
    acquireWakeLock()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquireWakeLock()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      wakeLock?.release?.().catch?.(() => {})
      wakeLock = null
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const prev = prevScoreRef.current
      const curr = scoreRef.current
      if (curr - prev >= 3) setTrend('↑')
      else if (prev - curr >= 3) setTrend('↓')
      else setTrend('→')
      prevScoreRef.current = curr
    }, 10000)
    return () => clearInterval(interval)
  }, []) // stable interval — reads via ref
  const trendColor = trend === '↑' ? 'var(--good)' : trend === '↓' ? 'var(--bad)' : 'var(--text-muted)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '5px 12px',
        background: 'var(--surface)',
        border: '1px solid rgba(122,152,255,0.30)',
        borderRadius: 100,
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: color,
          boxShadow: `0 0 0 2.5px ${color}28`,
          flexShrink: 0,
          animation: status === 'alert' && !isCalibrating ? 'dotPulse 1.1s ease-in-out infinite' : 'none',
          transition: 'background 0.4s',
        }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '0.01em', textTransform: 'capitalize' }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--line-strong)' }}>·</span>
        <span style={{ fontSize: 12, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums', transition: 'color 0.4s' }}>
          {isCalibrating ? '--' : score}
        </span>
        {!isCalibrating && (
          <span style={{ fontSize: 10, color: trendColor, opacity: 0.7, lineHeight: 1 }}>{trend}</span>
        )}
        {!isCalibrating && <SignalBars confidence={confidence} />}
      </div>
      {!isCalibrating && scoreHistory.length >= 2 && (
        <div style={{ paddingRight: 4 }}>
          <Sparkline scores={scoreHistory} scoreColor={color} />
        </div>
      )}
      {reasonText && (
        <div style={{
          padding: '3px 10px',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 100,
          fontSize: 11,
          color: 'var(--text-muted)',
          fontWeight: 500,
          letterSpacing: '0.01em',
          transition: 'opacity 0.3s',
        }}>
          {reasonText}
        </div>
      )}
    </div>
  )
}

export function ActivityPill({ activity, classification, connected, activeSince, prominent = false }) {
  const kind = classification?.kind || 'unclear'
  const isFocus = connected && (kind === 'aligned' || kind === 'supportive')
  const isDistraction = connected && (kind === 'blocked' || kind === 'distraction')
  const isOffGoal = connected && kind === 'off_goal'
  const color = isFocus ? 'var(--good)' : isDistraction ? 'var(--bad)' : isOffGoal ? 'var(--warn)' : 'var(--text-muted)'
  const bg = isFocus ? 'rgba(47,227,168,0.10)' : isDistraction ? 'rgba(255,77,106,0.12)' : isOffGoal ? 'rgba(255,179,64,0.12)' : 'var(--surface)'
  const border = isFocus ? 'var(--good)40' : isDistraction ? 'var(--bad)40' : isOffGoal ? 'var(--warn)40' : 'var(--line-strong)'
  const label = connected ? classification.label : 'No activity data'
  const duration = isDistraction && activeSince ? formatShortDuration(Date.now() - activeSince) : null
  const suffix = connected ? ({
    aligned: 'aligned',
    supportive: 'supportive',
    blocked: 'blocked',
    distraction: 'distraction',
    off_goal: 'off goal',
    unclear: null,
  }[kind] || null) : null
  const titleParts = [
    activity?.domain,
    activity?.title,
    activity?.app,
    activity?.full_url,
    activity?.url,
    activity?.window,
  ].filter(Boolean)

  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: prominent && isDistraction ? 5 : 0,
      minWidth: 0,
      maxWidth: prominent ? 320 : 220,
    }}>
      <div
        title={titleParts.length ? titleParts.join(' · ') : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 100,
          padding: prominent ? '8px 14px 8px 8px' : '6px 10px 6px 7px',
          fontSize: prominent ? 12 : 11,
          fontWeight: 800,
          color: connected ? 'var(--text-secondary)' : 'var(--text-muted)',
          width: prominent ? 'min(320px, calc(100vw - 48px))' : 'auto',
          maxWidth: prominent ? 'min(320px, calc(100vw - 48px))' : 220,
          minWidth: 0,
          boxShadow: isDistraction
            ? '0 0 0 2px rgba(239,68,68,0.14), 0 0 24px rgba(239,68,68,0.24)'
            : isFocus
              ? '0 0 0 2px rgba(34,197,94,0.10), 0 0 20px rgba(34,197,94,0.16)'
              : 'none',
          animation: isDistraction ? 'activityDistractionPulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        <span style={{
          width: prominent ? 26 : 22,
          height: prominent ? 26 : 22,
          borderRadius: '50%',
          background: connected ? color : 'var(--text-muted)',
          color: 'var(--bg)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 900,
          flexShrink: 0,
          boxShadow: connected ? `0 0 12px ${color}55` : 'none',
        }}>
          {connected && label ? label.charAt(0).toUpperCase() : '-'}
        </span>
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
          flex: 1,
        }}>
          {duration ? `${label} · ${duration}` : label}
        </span>
        {suffix && (
          // Follows the pill's own state. It used to be hardcoded green from
          // when the only label was "✓ focus app", so a blocked or distracting
          // site was labelled "distraction" in the colour that means good.
          <span style={{ color, fontSize: 10, fontWeight: 900, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {suffix}
          </span>
        )}
      </div>
      {prominent && isDistraction && (
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--bad)',
          letterSpacing: '0.01em',
          textShadow: '0 0 12px rgba(239,68,68,0.25)',
        }}>
          {kind === 'blocked' ? 'Blocked by your focus rules' : 'Likely distraction for this session'}
        </div>
      )}
    </div>
  )
}
